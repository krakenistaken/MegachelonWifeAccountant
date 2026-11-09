// src/app/api/employees/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';

// PUT: Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const empId = parseInt(id, 10);
    if (isNaN(empId)) {
      return NextResponse.json({ error: 'Geçersiz çalışan ID.' }, { status: 400 });
    }

    const body = await request.json();
    const { first_name, last_name, role, monthly_wage, phone, is_active } = body;

    const db = getDb();
    const existingRs = await db.execute({
      sql: 'SELECT * FROM employees WHERE id = ?',
      args: [empId],
    });
    const existing = existingRs.rows[0] as unknown as {
      first_name: string;
      last_name: string;
      role?: string;
      monthly_wage: number;
      daily_wage: number;
      phone: string | null;
      is_active: number;
    } | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'Çalışan bulunamadı.' }, { status: 404 });
    }

    const updatedFirstName = first_name !== undefined ? first_name.trim() : existing.first_name;
    const updatedLastName = last_name !== undefined ? last_name.trim() : existing.last_name;
    const updatedRole = role !== undefined ? role.trim() : (existing.role || '');
    
    let updatedMonthly = existing.monthly_wage;
    if (monthly_wage !== undefined && monthly_wage !== null && monthly_wage !== '') {
      updatedMonthly = parseFloat(monthly_wage) || 0;
    }
    const updatedDaily = Math.round((updatedMonthly / 30) * 100) / 100;

    const updatedPhone = phone !== undefined ? phone?.trim() || null : existing.phone;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    await db.execute({
      sql: `UPDATE employees 
            SET first_name = ?, last_name = ?, role = ?, monthly_wage = ?, daily_wage = ?, phone = ?, is_active = ?
            WHERE id = ?`,
      args: [updatedFirstName, updatedLastName, updatedRole, updatedMonthly, updatedDaily, updatedPhone, updatedActive, empId],
    });

    const updated = await db.execute({
      sql: 'SELECT * FROM employees WHERE id = ?',
      args: [empId],
    });
    return NextResponse.json({ employee: updated.rows[0] });
  } catch (error) {
    console.error('Employee PUT error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// DELETE: Delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const empId = parseInt(id, 10);
    if (isNaN(empId)) {
      return NextResponse.json({ error: 'Geçersiz çalışan ID.' }, { status: 400 });
    }

    const db = getDb();
    await db.execute({
      sql: 'DELETE FROM employees WHERE id = ?',
      args: [empId],
    });

    return NextResponse.json({ message: 'Çalışan silindi.' });
  } catch (error) {
    console.error('Employee DELETE error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
