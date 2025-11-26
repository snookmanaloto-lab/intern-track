import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LogOut, Clock, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { format, isWithinInterval, setHours, setMinutes, isToday } from 'date-fns';
import AttendanceHistory from '@/components/AttendanceHistory';
import AdminDashboard from '@/components/AdminDashboard';

// Time windows in 24-hour format
const CHECK_IN_WINDOW = {
  start: { hour: 7, minute: 0 },  // 7:00 AM
  end: { hour: 10, minute: 0 }    // 10:00 AM
};

const CHECK_OUT_WINDOW = {
  start: { hour: 15, minute: 0 }, // 3:00 PM
  end: { hour: 18, minute: 0 }    // 6:00 PM
};

const isWithinTimeWindow = (timeWindow: { start: { hour: number, minute: number }, end: { hour: number, minute: number } }) => {
  const now = new Date();
  if (!isToday(now)) return false;
  
  const start = setMinutes(setHours(now, timeWindow.start.hour), timeWindow.start.minute);
  const end = setMinutes(setHours(now, timeWindow.end.hour), timeWindow.end.minute);
  
  return isWithinInterval(now, { start, end });
};

interface AttendanceRecord {
  id: string;
  check_in: string;
  check_out: string | null;
  date: string;
}

interface UserRole {
  role: string;
}

const Dashboard = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [userRole, setUserRole] = useState<string>('user');
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchTodayAttendance();
      fetchUserRole();
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile(data);
    }
  };

  const fetchUserRole = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setUserRole(data.role);
    }
  };

  const fetchTodayAttendance = async () => {
    if (!user) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    setTodayAttendance(data);
    setLoadingAttendance(false);
  };

  const handleCheckIn = async () => {
    if (!user) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: user.id,
        date: today,
        check_in: now,
      });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Checked In",
        description: "Your attendance has been recorded!",
      });
      fetchTodayAttendance();
      window.location.reload();
    }
  };

  const handleCheckOut = async () => {
    if (!user || !todayAttendance) return;

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('attendance_records')
      .update({ check_out: now })
      .eq('id', todayAttendance.id);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Checked Out",
        description: "Have a great rest of your day!",
      });
      fetchTodayAttendance();
      window.location.reload();
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading || loadingAttendance) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Clock className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAdmin = userRole === 'admin';

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-primary/10 rounded-lg">
              <img src="/internship.png" alt="Internship logo" className="w-8 h-8 rounded-md object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Intern Attendance</h1>
              <p className="text-sm text-muted-foreground">
                Welcome, {profile?.full_name || user?.email}
              </p>
            </div>
          </div>
          <Button onClick={handleSignOut} variant="outline" size="sm">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {isAdmin ? (
        <AdminDashboard />
      ) : (
        <main className="container mx-auto px-4 py-8">
          <div className="grid gap-6 max-w-4xl mx-auto">
            <Card className="border-primary/20 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Today's Attendance
                </CardTitle>
                <CardDescription>
                  {format(new Date(), 'EEEE, MMMM d, yyyy')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!todayAttendance ? (
                  <div className="text-center py-8 space-y-4">
                    <XCircle className="w-12 h-12 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">You haven't checked in yet today</p>
                    {isWithinTimeWindow(CHECK_IN_WINDOW) ? (
                      <Button 
                        onClick={handleCheckIn} 
                        size="lg" 
                        className="gap-2 mt-4"
                      >
                        <CheckCircle className="w-5 h-5" />
                        Check In Now
                      </Button>
                    ) : (
                      <div className="mt-4 p-4 bg-muted/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Check-in is only available between 7:00 AM - 10:00 AM
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Current time: {format(new Date(), 'h:mm a')}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/20">
                      <div>
                        <p className="text-sm text-muted-foreground">Check In Time</p>
                        <p className="text-lg font-semibold text-success">
                          {format(new Date(todayAttendance.check_in), 'h:mm a')}
                        </p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-success" />
                    </div>

                    {todayAttendance.check_out ? (
                      <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg border border-primary/20">
                        <div>
                          <p className="text-sm text-muted-foreground">Check Out Time</p>
                          <p className="text-lg font-semibold text-primary">
                            {format(new Date(todayAttendance.check_out), 'h:mm a')}
                          </p>
                        </div>
                        <CheckCircle className="w-8 h-8 text-primary" />
                      </div>
                    ) : isWithinTimeWindow(CHECK_OUT_WINDOW) ? (
                      <Button 
                        onClick={handleCheckOut} 
                        variant="outline" 
                        className="w-full py-6 text-lg gap-2"
                      >
                        <LogOut className="w-5 h-5" />
                        Check Out Now
                      </Button>
                    ) : (
                      <div className="p-4 bg-muted/20 rounded-lg border">
                        <p className="text-sm text-muted-foreground">
                          Check-out is only available between 3:00 PM - 6:00 PM
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Current time: {format(new Date(), 'h:mm a')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <AttendanceHistory userId={user?.id || ''} />
          </div>
        </main>
      )}
    </div>
  );
};

export default Dashboard;
