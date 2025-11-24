import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LogOut, Clock, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import AttendanceHistory from '@/components/AttendanceHistory';
import AdminDashboard from '@/components/AdminDashboard';

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
                  <div className="text-center py-8">
                    <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">You haven't checked in yet today</p>
                    <Button onClick={handleCheckIn} size="lg" className="gap-2">
                      <CheckCircle className="w-5 h-5" />
                      Check In Now
                    </Button>
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
                    ) : (
                      <Button onClick={handleCheckOut} size="lg" className="w-full gap-2">
                        <CheckCircle className="w-5 h-5" />
                        Check Out
                      </Button>
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
