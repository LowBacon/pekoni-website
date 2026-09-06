import { NextResponse } from "next/server";
export function GET() { return NextResponse.json({ feed: [], retired: true, replacement: "/api/results" }, { status: 410 }); }
