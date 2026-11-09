// src/app/api/employees/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';

// GET: List all employees with their total stats
export async function GET() {
  try {
    await initializeDatabase();
    const db = getDb();

    const employeesRs = await db.execute(`
      SELECT 
        e.id, e.first_name, e.last_name, COALESCE(e.role, '') as role, e.monthly_wage, e.daily_wage, e.phone, e.is_active, e.created_at,
        COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün', 'Mesai') THEN COALESCE(a.work_hours, CASE WHEN a.status = 'Yarım Gün' THEN 5.5 ELSE 11 END) ELSE 0 END), 0) as total_hours_worked,
        COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün', 'Mesai') THEN a.daily_wage ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün', 'Mesai') THEN (CASE WHEN a.paid_amount > 0 THEN a.paid_amount WHEN a.is_paid = 1 THEN a.daily_wage ELSE 0 END) ELSE 0 END), 0) as total_paid
      FROM employees e
      LEFT JOIN attendances a ON e.id = a.employee_id
      GROUP BY e.id
      ORDER BY e.is_active DESC, e.first_name ASC
    `);

    const employees = (employeesRs.rows as unknown as Array<{
      id: number;
      first_name: string;
      last_name: string;
      role: string;
      monthly_wage: number;
      daily_wage: number;
      phone: string | null;
      is_active: number;
      created_at: string;
      total_hours_worked: number;
      total_earned: number;
      total_paid: number;
    }>).map((emp) => {
      const monthly = Number(emp.monthly_wage) || 0;
      const daily = Number(emp.daily_wage) || 0;
      return {
        ...emp,
        role: emp.role || '',
        monthly_wage: monthly,
        daily_wage: daily,
        hourly_wage: Math.round((daily / 11) * 100) / 100,
        total_hours_worked: Number(emp.total_hours_worked),
        total_days_worked: Number(emp.total_hours_worked), // keep backwards compatibility if any component reads this
        total_earned: Number(emp.total_earned),
        total_paid: Number(emp.total_paid),
        balance_due: Number(emp.total_earned) - Number(emp.total_paid),
      };
    });

    return NextResponse.json({ employees });
  } catch (error) {
    console.error('Employees GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// POST: Add new employee
export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const body = await request.json();
    const { first_name, last_name, role, monthly_wage, phone } = body;

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: 'İsim ve soyisim alanları zorunludur.' },
        { status: 400 }
      );
    }

    const monthlyVal = parseFloat(monthly_wage) || 0;
    if (monthlyVal < 0) {
      return NextResponse.json(
        { error: 'Maaş 0 veya daha büyük olmalıdır.' },
        { status: 400 }
      );
    }

    const dailyVal = Math.round((monthlyVal / 30) * 100) / 100;

    const db = getDb();
    const result = await db.execute({
      sql: `INSERT INTO employees (first_name, last_name, role, monthly_wage, daily_wage, phone) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [first_name.trim(), last_name.trim(), role?.trim() || '', monthlyVal, dailyVal, phone?.trim() || null],
    });

    const newEmpRs = await db.execute({
      sql: 'SELECT * FROM employees WHERE id = ?',
      args: [Number(result.lastInsertRowid)],
    });

    return NextResponse.json({ employee: newEmpRs.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Employees POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
