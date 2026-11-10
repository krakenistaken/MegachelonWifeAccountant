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

    // Fetch active employees
    const empBaseRs = await db.execute({
      sql: `SELECT id, first_name, last_name, COALESCE(role, '') as role, monthly_wage, daily_wage, is_active
            FROM employees
            WHERE is_active = 1
            ORDER BY first_name ASC, last_name ASC`,
    });

    // Also fetch individual day attendances for this month
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

    const attendances = dayAttendancesRs.rows as unknown as Array<{
      employee_id: number;
      date: string;
      status: string;
      work_hours: number;
      daily_wage: number;
      paid_amount: number;
    }>;

    // Group attendances by employee
    const attByEmp = new Map<number, Map<string, typeof attendances[0]>>();
    for (const a of attendances) {
      if (!attByEmp.has(a.employee_id)) {
        attByEmp.set(a.employee_id, new Map());
      }
      attByEmp.get(a.employee_id)!.set(a.date, a);
    }

    // Build list of all dates in month
    const allDatesInMonth: { dateStr: string; isWeekend: boolean; isSunday: boolean; isSaturday: boolean }[] = [];
    for (let day = 1; day <= lastDayOfMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${month}-${dayStr}`;
      const d = new Date(y, m - 1, day);
      const dayOfWeek = d.getDay();
      allDatesInMonth.push({
        dateStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isSunday: dayOfWeek === 0,
        isSaturday: dayOfWeek === 6,
      });
    }

    // Compute employee monthly stats ensuring weekends (HS) are counted as earned unless explicitly absent
    const employees = (empBaseRs.rows as unknown as Array<{
      id: number;
      first_name: string;
      last_name: string;
      role: string;
      monthly_wage: number;
      daily_wage: number;
      is_active: number;
    }>).map((emp) => {
      const empAttMap = attByEmp.get(emp.id) || new Map<string, typeof attendances[0]>();
      const defaultDaily = Number(emp.daily_wage) || 0;
      const hourlyRate = defaultDaily > 0 ? defaultDaily / 11 : 0;

      let totalEarned = 0;
      let totalPaid = 0;
      let totalHours = 0;
      let daysAttended = 0;
      let daysAbsent = 0;

      for (const d of allDatesInMonth) {
        const att = empAttMap.get(d.dateStr);

        if (att) {
          if (att.status === 'Gelmedi') {
            daysAbsent += 1;
            // Gelmedi -> 0 wage earned
          } else if (att.status === 'Geldi' || att.status === 'Yarım Gün' || att.status === 'Mesai') {
            daysAttended += 1;
            totalEarned += Number(att.daily_wage || 0);
            totalPaid += Number(att.paid_amount || 0);
            totalHours += Number(att.work_hours || 0);
          }
        } else {
          // No explicit record entered for this day
          if (d.isWeekend) {
            // Hafta sonu (Cumartesi ve Pazar): Otomatik HS (Hafta Tatili) sayılır, 11 saatlik standart ücret hakedilir
            totalEarned += defaultDaily;
            totalHours += 11;
            daysAttended += 1;
          }
        }
      }

      return {
        employee_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        role: emp.role || '',
        default_monthly_wage: Number(emp.monthly_wage) || defaultDaily * 30,
        default_daily_wage: defaultDaily,
        is_active: emp.is_active,
        total_hours_worked: totalHours,
        days_attended: daysAttended,
        days_absent: daysAbsent,
        total_earned: Math.round(totalEarned * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        balance_due: Math.round((totalEarned - totalPaid) * 100) / 100,
      };
    });

    const totalDaysAttended = employees.reduce((s, e) => s + Number(e.days_attended), 0);
    const totalEarned = employees.reduce((s, e) => s + Number(e.total_earned), 0);
    const totalPaid = employees.reduce((s, e) => s + Number(e.total_paid), 0);
    const totalDue = totalEarned - totalPaid;

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
      attendances,
    });
  } catch (error) {
    console.error('Salaries Summary GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
