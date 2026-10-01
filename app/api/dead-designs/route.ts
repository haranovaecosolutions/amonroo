import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

let demoDeadDesigns: DeadDesignRecord[] = [];
type DeadDesignRecord = { design_id: string; created_at: string };

export async function GET() {
  const db = serverDb();
  if (!db) return NextResponse.json(demoDeadDesigns);
  const { data, error } = await db.from('dead_designs').select('design_id,created_at').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const designId = typeof body.design_id === 'string' ? body.design_id.trim() : '';
  if (!designId) return NextResponse.json({ error: 'Select a Design ID.' }, { status: 400 });

  const db = serverDb();
  if (!db) {
    if (demoDeadDesigns.some((item) => item.design_id.toLowerCase() === designId.toLowerCase())) {
      return NextResponse.json({ error: `${designId} is already in the dead-design list.` }, { status: 409 });
    }
    const deadDesign = { design_id: designId, created_at: new Date().toISOString() };
    demoDeadDesigns = [...demoDeadDesigns, deadDesign];
    return NextResponse.json(deadDesign, { status: 201 });
  }

  const { data: design, error: designError } = await db.from('inventory_products').select('sku').eq('sku', designId).maybeSingle();
  if (designError) return NextResponse.json({ error: designError.message }, { status: 500 });
  if (!design) return NextResponse.json({ error: `Design ID ${designId} was not found.` }, { status: 404 });
  const { data, error } = await db.from('dead_designs').insert({ design_id: designId }).select('design_id,created_at').single();
  if (error?.code === '23505') return NextResponse.json({ error: `${designId} is already in the dead-design list.` }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const designId = typeof body.design_id === 'string' ? body.design_id.trim() : '';
  if (!designId) return NextResponse.json({ error: 'A Design ID is required.' }, { status: 400 });

  const db = serverDb();
  if (!db) {
    const existingCount = demoDeadDesigns.length;
    demoDeadDesigns = demoDeadDesigns.filter((item) => item.design_id !== designId);
    if (demoDeadDesigns.length === existingCount) return NextResponse.json({ error: 'Dead design not found.' }, { status: 404 });
    return NextResponse.json({ design_id: designId });
  }

  const { data, error } = await db.from('dead_designs').delete().eq('design_id', designId).select('design_id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Dead design not found.' }, { status: 404 });
  return NextResponse.json(data);
}