import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { Users, CheckCircle, XCircle, TrendingUp, School, UserPlus, Clock, BarChart2, PieChart, Activity } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Pie,
  Cell
} from 'recharts';

interface AttendanceWithUser {
  id: string;
  check_in: string;
  check_out: string | null;
  date: string;
  profiles: {
    full_name: string;
    email: string;
    school?: string;
  };
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  school: string;
  created_at: string;
  last_sign_in_at?: string;
}

interface DailyStats {
  date: string;
  checkIns: number;
  checkOuts: number;
}

interface SchoolDistribution {
  name: string;
  count: number;
  color: string;
}

interface InternTotalHours {
  userId: string;
  fullName: string;
  email: string;
  school?: string;
  totalHours: string;
}

const AdminDashboard = () => {
  const [todayRecords, setTodayRecords] = useState<AttendanceWithUser[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [stats, setStats] = useState({
    totalInterns: 0,
    checkedIn: 0,
    checkedOut: 0,
    totalUsers: 0,
    totalSchools: 0,
    averageDuration: '0h 0m',
    activeToday: 0,
  });
  const [weeklyStats, setWeeklyStats] = useState<DailyStats[]>([]);
  const [schoolDistribution, setSchoolDistribution] = useState<SchoolDistribution[]>([]);
  const [internTotalHours, setInternTotalHours] = useState<InternTotalHours[]>([]);
  const [recentSignups, setRecentSignups] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return format(firstOfMonth, 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchTodayAttendance(),
        fetchStats(),
        fetchUserProfiles(),
        fetchWeeklyStats(),
        fetchSchoolDistribution(),
        fetchRecentSignups(),
        fetchInternTotalHours()
      ]);
      setLoading(false);
    };
    
    loadData();
  }, []);

  const fetchTodayAttendance = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      console.log('Fetching attendance for date:', today);
      
      // First, fetch just the attendance records
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('date', today)
        .order('check_in', { ascending: false });

      if (attendanceError) {
        console.error('Error fetching attendance records:', attendanceError);
        throw attendanceError;
      }

      if (!attendanceData || attendanceData.length === 0) {
        console.log('No attendance records found for today');
        setTodayRecords([]);
        setStats(prev => ({
          ...prev,
          checkedIn: 0,
          checkedOut: 0,
          activeToday: 0
        }));
        return;
      }

      console.log('Attendance records found:', attendanceData);

      // Get unique user IDs from attendance records
      const userIds = [...new Set(attendanceData.map(record => record.user_id))];
      
      // Fetch user profiles in a separate query
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching user profiles:', profilesError);
        throw profilesError;
      }

      // Create a map of user IDs to profiles for quick lookup
      const profilesMap = new Map(profilesData?.map(profile => [profile.id, profile]) || []);

      // Combine attendance data with profile information
      const formattedData = attendanceData.map(record => {
        const profile = profilesMap.get(record.user_id) || {
          full_name: 'Unknown User',
          email: '',
          school: 'Not specified'
        };

        return {
          ...record,
          profiles: profile
        };
      });

      console.log('Formatted attendance data:', formattedData);
      
      setTodayRecords(formattedData as AttendanceWithUser[]);
      
      // Update stats
      const checkedOutCount = attendanceData.filter(record => record.check_out).length;
      setStats(prev => ({
        ...prev,
        checkedIn: attendanceData.length,
        checkedOut: checkedOutCount,
        activeToday: attendanceData.length - checkedOutCount
      }));

    } catch (error) {
      console.error('Error in fetchTodayAttendance:', error);
      setTodayRecords([]);
    }
  };

  const fetchUserProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      setUserProfiles(data);
      // Count unique schools
      const schools = new Set(data.map(user => user.school).filter(Boolean));
      setStats(prev => ({
        ...prev,
        totalUsers: data.length,
        totalSchools: schools.size
      }));
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    const [
      { count: totalCount },
      { count: checkedInCount },
      { count: checkedOutCount },
      { data: todayAttendance }
    ] = await Promise.all([
      supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      supabase.from('attendance_records').select('*', { count: 'exact', head: true }).eq('date', today),
      supabase.from('attendance_records').select('*', { count: 'exact', head: true }).eq('date', today).not('check_out', 'is', null),
      supabase.from('attendance_records').select('*').eq('date', today)
    ]);

    // Calculate average duration
    let totalDuration = 0;
    let completedSessions = 0;
    
    todayAttendance?.forEach(record => {
      if (record.check_out) {
        const start = new Date(record.check_in);
        const end = new Date(record.check_out);
        totalDuration += end.getTime() - start.getTime();
        completedSessions++;
      }
    });

    const avgMs = completedSessions > 0 ? totalDuration / completedSessions : 0;
    const avgHours = Math.floor(avgMs / (1000 * 60 * 60));
    const avgMinutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));

    setStats(prev => ({
      ...prev,
      totalInterns: totalCount || 0,
      checkedIn: checkedInCount || 0,
      checkedOut: checkedOutCount || 0,
      averageDuration: `${avgHours}h ${avgMinutes}m`,
      activeToday: todayAttendance?.length || 0
    }));
  };

  const fetchWeeklyStats = async () => {
    const today = new Date();
    const weekAgo = subDays(today, 6);
    const dateRange = eachDayOfInterval({ start: weekAgo, end: today });

    const { data } = await supabase
      .from('attendance_records')
      .select('date, check_in, check_out')
      .gte('date', format(weekAgo, 'yyyy-MM-dd'))
      .lte('date', format(today, 'yyyy-MM-dd'));

    const dailyStats = dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayData = data?.filter(record => record.date === dateStr) || [];
      
      return {
        date: format(date, 'EEE'),
        checkIns: dayData.length,
        checkOuts: dayData.filter(record => record.check_out).length
      };
    });

    setWeeklyStats(dailyStats);
  };

  const fetchSchoolDistribution = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('school')
      .not('school', 'is', null);

    if (!data) return;

    const schoolCounts = data.reduce((acc, { school }) => {
      acc[school] = (acc[school] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
    const distribution = Object.entries(schoolCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], index) => ({
        name,
        count,
        color: colors[index % colors.length]
      }));

    setSchoolDistribution(distribution);
  };

  const fetchInternTotalHours = async (from?: string, to?: string) => {
    const fromDate = from || dateFrom;
    const toDate = to || dateTo;

    const { data: attendanceData } = await supabase
      .from('attendance_records')
      .select('user_id, check_in, check_out, date')
      .gte('date', fromDate)
      .lte('date', toDate)
      .not('check_out', 'is', null);

    if (!attendanceData || attendanceData.length === 0) {
      setInternTotalHours([]);
      return;
    }

    const durationsByUser: Record<string, number> = {};

    attendanceData.forEach((record: any) => {
      if (!record.check_in || !record.check_out) return;
      const start = new Date(record.check_in);
      const end = new Date(record.check_out);
      const diff = end.getTime() - start.getTime();
      if (!durationsByUser[record.user_id]) {
        durationsByUser[record.user_id] = 0;
      }
      durationsByUser[record.user_id] += diff;
    });

    const userIds = Object.keys(durationsByUser);
    if (userIds.length === 0) {
      setInternTotalHours([]);
      return;
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, email, school')
      .in('id', userIds);

    const profilesMap = new Map(
      (profilesData || []).map((p: any) => [p.id, p])
    );

    const result: InternTotalHours[] = userIds.map(userId => {
      const profile = profilesMap.get(userId) || {
        full_name: 'Unknown User',
        email: '',
        school: 'Not specified',
      };

      const totalMs = durationsByUser[userId] || 0;
      const hours = Math.floor(totalMs / (1000 * 60 * 60));
      const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));

      return {
        userId,
        fullName: profile.full_name,
        email: profile.email,
        school: profile.school,
        totalHours: `${hours}h ${minutes}m`,
      };
    }).sort((a, b) => {
      const aParts = a.totalHours.split(' ');
      const bParts = b.totalHours.split(' ');
      const aHours = parseInt(aParts[0]);
      const bHours = parseInt(bParts[0]);
      return bHours - aHours;
    });

    setInternTotalHours(result);
  };

  const handleDateFromChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFrom = e.target.value;
    setDateFrom(newFrom);
    await fetchInternTotalHours(newFrom, dateTo);
  };

  const handleDateToChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTo = e.target.value;
    setDateTo(newTo);
    await fetchInternTotalHours(dateFrom, newTo);
  };

  const handleThisMonth = async () => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const fromStr = format(firstOfMonth, 'yyyy-MM-dd');
    const toStr = format(now, 'yyyy-MM-dd');
    setDateFrom(fromStr);
    setDateTo(toStr);
    await fetchInternTotalHours(fromStr, toStr);
  };

  const exportInternHoursCsv = () => {
    if (!internTotalHours.length) return;

    const header = ['Name', 'School', 'Email', 'Total Hours'];
    const rows = internTotalHours.map(i => [
      `"${i.fullName.replace(/"/g, '""')}"`,
      `"${(i.school || 'Not specified').replace(/"/g, '""')}"`,
      `"${(i.email || '').replace(/"/g, '""')}"`,
      i.totalHours,
    ]);

    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `intern-total-hours-${dateFrom}-to-${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchRecentSignups = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (data) {
      setRecentSignups(data);
    }
  };

  const calculateDuration = (checkIn: string, checkOut: string | null) => {
    if (!checkOut) return 'In Progress';
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = end.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h2 className="text-3xl font-bold mb-2">Admin Dashboard</h2>
          <p className="text-muted-foreground">Overview of all intern attendance and users</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-blue-600 dark:text-blue-300">Total Interns</CardTitle>
                <p className="text-xs text-blue-500/80 dark:text-blue-400/80">Active this week</p>
              </div>
              <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/50">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-900 dark:text-white">{stats.totalInterns}</div>
              <div className="mt-2 text-xs text-blue-600 dark:text-blue-300">
                <span className="font-medium">+{Math.floor(stats.totalInterns * 0.12)}</span> from last week
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-green-600 dark:text-green-300">Today's Activity</CardTitle>
                <p className="text-xs text-green-500/80 dark:text-green-400/80">Active / Completed</p>
              </div>
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/50">
                <Activity className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-900 dark:text-white">
                {stats.checkedIn}<span className="text-lg text-green-600 dark:text-green-300"> / {stats.checkedOut}</span>
              </div>
              <div className="mt-2 text-xs text-green-600 dark:text-green-300">
                <span className="font-medium">{stats.checkedIn > 0 ? Math.round((stats.checkedOut / stats.checkedIn) * 100) : 0}%</span> completion rate
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-purple-600 dark:text-purple-300">Avg. Session</CardTitle>
                <p className="text-xs text-purple-500/80 dark:text-purple-400/80">Today's average</p>
              </div>
              <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/50">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900 dark:text-white">{stats.averageDuration}</div>
              <div className="mt-2 text-xs text-purple-600 dark:text-purple-300">
                <span className="font-medium">{stats.checkedOut} sessions</span> completed
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-900/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-300">Schools</CardTitle>
                <p className="text-xs text-amber-500/80 dark:text-amber-400/80">Active institutions</p>
              </div>
              <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/50">
                <School className="h-5 w-5 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-900 dark:text-white">{stats.totalSchools}</div>
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                <span className="font-medium">{schoolDistribution[0]?.count || 0}</span> from {schoolDistribution[0]?.name || 'N/A'}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Weekly Attendance</CardTitle>
                  <CardDescription>Check-ins and check-outs over the past week</CardDescription>
                </div>
                <BarChart2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'white',
                        borderRadius: '0.5rem',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                      }}
                    />
                    <Bar dataKey="checkIns" name="Check-ins" radius={[4, 4, 0, 0]} fill="#3b82f6" />
                    <Bar dataKey="checkOuts" name="Check-outs" radius={[4, 4, 0, 0]} fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>School Distribution</CardTitle>
                  <CardDescription>Interns by institution</CardDescription>
                </div>
                <PieChart className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center h-[300px]">
              {schoolDistribution.length > 0 ? (
                <div className="relative w-full h-full">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{stats.totalInterns}</div>
                      <div className="text-sm text-muted-foreground">Total</div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={schoolDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="count"
                      >
                        {schoolDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value, name, props) => [
                          `${props.payload.name}: ${value} (${Math.round((Number(value) / stats.totalInterns) * 100)}%)`,
                          'Interns'
                        ]}
                        contentStyle={{
                          backgroundColor: 'white',
                          borderRadius: '0.5rem',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-8">
                  <PieChart className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No school data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Today's Attendance</CardTitle>
                  <CardDescription>
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {stats.checkedIn} Active
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    {stats.checkedOut} Completed
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Loading attendance data...</p>
              ) : stats.checkedIn === 0 ? (
                <div className="text-center py-8">
                  <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No attendance records for today</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>School</TableHead>
                        <TableHead>Check In</TableHead>
                        <TableHead>Check Out</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {todayRecords.map((record) => {
                        // Debug log to check record structure
                        console.log('Record:', record);
                        
                        // Safely get profile data
                        const profile = record.profiles && typeof record.profiles === 'object' && !Array.isArray(record.profiles) 
                          ? record.profiles 
                          : { full_name: 'Unknown', email: '', school: 'Not specified' };
                        
                        return (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">
                              {profile.full_name || 'Unknown'}
                            </TableCell>
                            <TableCell>{profile.school || 'Not specified'}</TableCell>
                            <TableCell>
                              {record.check_in ? format(new Date(record.check_in), 'h:mm a') : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {record.check_out ? format(new Date(record.check_out), 'h:mm a') : '-'}
                            </TableCell>
                            <TableCell>
                              {calculateDuration(record.check_in, record.check_out)}
                            </TableCell>
                            <TableCell>
                              {record.check_out ? (
                                <span className="inline-flex items-center gap-1 text-primary">
                                  <CheckCircle className="w-4 h-4" />
                                  Complete
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-500">
                                  <TrendingUp className="w-4 h-4" />
                                  Active
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Users</CardTitle>
              <CardDescription>Latest registered users</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : userProfiles.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No users found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userProfiles.slice(0, 5).map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.school || 'Not specified'}</TableCell>
                        <TableCell>{format(new Date(user.created_at), 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>Complete list of registered users</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : userProfiles.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No users found</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userProfiles.map((user) => {
                      const hasAttendance = todayRecords.some(
                        record => record.profiles?.email === user.email
                      );
                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.full_name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.school || 'Not specified'}</TableCell>
                          <TableCell>{format(new Date(user.created_at), 'MMM d, yyyy')}</TableCell>
                          <TableCell>
                            {hasAttendance ? (
                              <span className="inline-flex items-center gap-1 text-success">
                                <CheckCircle className="w-4 h-4" />
                                Present
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <CardTitle>Intern Total Hours</CardTitle>
                <CardDescription>Total completed hours per intern from first sign-in up to now</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                <div className="flex items-center gap-1">
                  <span>From:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={handleDateFromChange}
                    className="border rounded px-1 py-0.5 text-xs md:text-sm bg-background"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span>To:</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={handleDateToChange}
                    className="border rounded px-1 py-0.5 text-xs md:text-sm bg-background"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleThisMonth}
                  className="border rounded px-2 py-0.5 text-xs md:text-sm hover:bg-muted"
                >
                  This month
                </button>
                <button
                  type="button"
                  onClick={exportInternHoursCsv}
                  className="border rounded px-2 py-0.5 text-xs md:text-sm bg-primary text-primary-foreground hover:opacity-90"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : internTotalHours.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No completed sessions found</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Total Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {internTotalHours.map((intern) => (
                      <TableRow key={intern.userId}>
                        <TableCell className="font-medium">{intern.fullName}</TableCell>
                        <TableCell>{intern.school || 'Not specified'}</TableCell>
                        <TableCell>{intern.email || '-'}</TableCell>
                        <TableCell>{intern.totalHours}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default AdminDashboard;