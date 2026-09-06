import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, USERNAME_PATTERN } from "@/server/auth";
import { randomSeed, hashSeed } from "@/server/rng";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

const schema = z.object({
  soundEnabled: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  publicActivity: z.boolean().optional(),
  minecraftUsername: z
    .string()
    .trim()
    .regex(USERNAME_PATTERN, "Minecraft-nimi: 3–16 merkkiä.")
    .nullable()
    .optional(),
  clientSeed: z.string().trim().min(4).max(64).optional(),
  rotateServerSeed: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`settings:${user.id}`, LIMITS.write);
    const input = await parseBody(request, schema);

    const data: Record<string, unknown> = {};
    if (input.soundEnabled !== undefined) data.soundEnabled = input.soundEnabled;
    if (input.reducedMotion !== undefined) data.reducedMotion = input.reducedMotion;
    if (input.publicActivity !== undefined) data.publicActivity = input.publicActivity;
    if (input.minecraftUsername !== undefined) data.minecraftUsername = input.minecraftUsername;
    if (input.clientSeed !== undefined) data.clientSeed = input.clientSeed;

    const { settings, revealedSeed } = await prisma.$transaction(async tx => {
      const current = await tx.user.update({where:{id:user.id},data:{updatedAt:new Date()},select:{serverSeed:true}});
      let revealedSeed: string | null = null;
      if(input.rotateServerSeed || input.clientSeed !== undefined){
        const active=await tx.gameSession.count({where:{userId:user.id,status:"ACTIVE"}});
        if(active) throw new Error("Päätä keskeneräiset pelit ennen siementen vaihtoa.");
      }
      if(input.rotateServerSeed){
        revealedSeed=current.serverSeed;
        await tx.retiredSeed.upsert({where:{hash:hashSeed(revealedSeed)},create:{hash:hashSeed(revealedSeed),seed:revealedSeed,userId:user.id},update:{}});
        const next=randomSeed();data.serverSeed=next;data.serverSeedHash=hashSeed(next);data.nonce=0;
      }
      const settings=await tx.user.update({where:{id:user.id},data,select:{soundEnabled:true,reducedMotion:true,publicActivity:true,minecraftUsername:true,clientSeed:true,serverSeedHash:true,nonce:true}});
      return {settings,revealedSeed};
    });

    return ok({ settings, revealedSeed });
  } catch (error) {
    return handleError(error);
  }
}
