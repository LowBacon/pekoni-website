import fs from 'node:fs';
const edit=(p,f)=>fs.writeFileSync(p,f(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')));
edit('src/server/oauth.ts',s=>{
 s=s.replace('import crypto from "node:crypto";', 'import crypto from "node:crypto";\nimport * as oauth from "oauth4webapi";');
 s=s.replace('  expiresAt: number;','  expiresAt: number;\n  userId?: string;');
 s=s.replace('options: { mode: OAuthMode; next: string }','options: { mode: OAuthMode; next: string; userId?: string }');
 s=s.replace('      mode: options.mode,','      mode: options.mode,\n      userId: options.userId,');
 s=s.replace('  url.searchParams.set("code_challenge", challenge);\n  url.searchParams.set("code_challenge_method", "S256");','  if (provider === "google") {\n    url.searchParams.set("code_challenge", challenge);\n    url.searchParams.set("code_challenge_method", "S256");\n  }');
 const a=s.indexOf('  const body = new URLSearchParams(',s.indexOf('export async function fetchProfile'));
 const b=s.indexOf('  const profileResponse =',a);
 s=s.slice(0,a)+`  const as: oauth.AuthorizationServer = { issuer: provider === "google" ? "https://accounts.google.com" : "https://discord.com", token_endpoint: definition.tokenUrl };
  const client: oauth.Client = { client_id: creds.id };
  // State has already been verified against the signed handoff in the callback.
  const parameters = oauth.validateAuthResponse(as, client, new URLSearchParams({ code }), oauth.expectNoState);
  let accessToken: string;
  try {
    const response = await oauth.authorizationCodeGrantRequest(as, client, oauth.ClientSecretPost(creds.secret), parameters, redirectUri(request, provider), provider === "google" ? verifier : oauth.nopkce, { signal: AbortSignal.timeout(10000) });
    const token = await oauth.processAuthorizationCodeResponse(as, client, response);
    accessToken = token.access_token;
  } catch { throw new OAuthError("Tunnistautuminen epäonnistui. Yritä uudelleen.", 502); }

`+s.slice(b);
 s=s.replace('${token.access_token}','${accessToken}');
 s=s.replace('scope: "openid email profile"','scope: "email profile"'); // OAuth userinfo is authoritative; no unused ID token.
 const comment=s.indexOf('/**'); const end=s.indexOf('/* -------------------------------------------------------------------------- */',comment);
 s=s.slice(0,comment)+'/** OAuth code exchange uses oauth4webapi. Google uses PKCE; Discord uses its confidential-client flow. Existing account/session storage is retained. */\n\n'+s.slice(end);
 return s;
});
edit('src/app/api/auth/oauth/[provider]/start/route.ts',s=>s.replace('{ mode, next }','{ mode, next, userId: user?.id }'));
edit('src/app/api/auth/oauth/[provider]/callback/route.ts',s=>s.replace('      if (!user) return', '      if (!user || user.id !== handoff.userId || user.status !== "ACTIVE") return'));
edit('src/server/wallet.ts',s=>s.replace('  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);\n  await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: cutoff } } });','  // Retain replay keys permanently; replaying an old request must never debit again.'));
edit('src/app/api/settings/route.ts',s=>{
 const a=s.indexOf('    let revealedSeed:'); const b=s.indexOf('    return ok({ settings, revealedSeed });',a);
 s=s.slice(0,a)+`    const { settings, revealedSeed } = await prisma.$transaction(async tx => {
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

`+s.slice(b);return s;
});
