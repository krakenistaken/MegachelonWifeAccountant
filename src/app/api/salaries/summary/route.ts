// src/app/api/salaries/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';

// GET: Monthly payroll & attendance summary
export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
    const month = searchParams.get('month') || currentMonthStr;

    const startDate = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDayOfMonth = new Date(y, m, 0).getDate();
    const endDate = `${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const empRs = await db.execute({
      sql: `SELECT 
              e.id as employee_id,
              e.first_name,
              e.last_name,
              COALESCE(e.role, '') as role,
              e.monthly_wage as default_monthly_wage,
              e.daily_wage as default_daily_wage,
              e.is_active,
              COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün', 'Mesai') THEN COALESCE(a.work_hours, CASE WHEN a.status = 'Yarım Gün' THEN 5.5 ELSE 11 END) ELSE 0 END), 0) as total_hours_worked,
              COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün', 'Mesai') THEN 1 ELSE 0 END), 0) as days_attended,
              COALESCE(SUM(CASE WHEN a.status = 'Gelmedi' THEN 1 ELSE 0 END), 0) as days_absent,
              COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün', 'Mesai') THEN a.daily_wage ELSE 0 END), 0) as total_earned,
              COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün', 'Mesai') THEN (CASE WHEN a.paid_amount > 0 THEN a.paid_amount WHEN a.is_paid = 1 THEN a.daily_wage ELSE 0 END) ELSE 0 END), 0) as total_paid
            FROM employees e
            LEFT JOIN attendances a ON e.id = a.employee_id AND a.date BETWEEN ? AND ?
            WHERE e.is_active = 1 OR a.id IS NOT NULL
            GROUP BY e.id
            ORDER BY e.first_name ASC, e.last_name ASC`,
      args: [startDate, endDate],
    });

    const employeeSummaries = empRs.rows as unknown as Array<{
      employee_id: number;
      first_name: string;
      last_name: string;
      role: string;
      default_monthly_wage: number;
      default_daily_wage: number;
      is_active: number;
      total_hours_worked: number;
      days_attended: number;
      days_absent: number;
      total_earned: number;
      total_paid: number;
    }>;

    const employees = employeeSummaries.map((emp) => ({
      ...emp,
      role: emp.role || '',
      total_hours_worked: Number(emp.total_hours_worked),
      days_attended: Number(emp.days_attended),
      days_absent: Number(emp.days_absent),
      total_earned: Number(emp.total_earned),
      total_paid: Number(emp.total_paid),
      balance_due: Number(emp.total_earned) - Number(emp.total_paid),
    }));

    const totalDaysAttended = employees.reduce((s, e) => s + Number(e.days_attended), 0);
    const totalEarned = employees.reduce((s, e) => s + Number(e.total_earned), 0);
    const totalPaid = employees.reduce((s, e) => s + Number(e.total_paid), 0);
    const totalDue = totalEarned - totalPaid;

    // Also fetch individual day attendances for this month to include in daily/weekly breakdown
    const dayAttendancesRs = await db.execute({
      sql: `SELECT 
              employee_id, 
              date, 
              status, 
              COALESCE(work_hours, CASE WHEN status = 'Gelmedi' THEN 0 WHEN status = 'Yarım Gün' THEN 5.5 ELSE 11 END) as work_hours,
              daily_wage, 
              paid_amount 
            FROM attendances 
            WHERE date BETWEEN ? AND ?`,
      args: [startDate, endDate],
    });

    return NextResponse.json({
      month,
      startDate,
      endDate,
      summary: {
        totalEmployees: employees.length,
        totalDaysAttended,
        totalEarned,
        totalPaid,
        totalDue,
      },
      employees,
      attendances: dayAttendancesRs.rows,
    });
  } catch (error) {
    console.error('Salaries Summary GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
