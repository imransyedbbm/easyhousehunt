import BrandLogo from "@/components/BrandLogo";
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, User, LayoutDashboard, Shield, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const { user, signOut, hasRole } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-lg border-b">
      <div className="container mx-auto px-4 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2 font-heading text-xl font-bold text-primary">
          <BrandLogo size="md" />
        </Link>

        <div className="hidden md:flex items-center gap-4">
          <Link to="/search" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Browse
          </Link>
          {user && hasRole('landlord') && (
            <Link to="/landlord" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              My Listings
            </Link>
          )}
          {user && hasRole('admin') && (
            <Link to="/admin" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <span className="flex items-center gap-1"><Shield className="h-4 w-4" /> Admin</span>
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              {hasRole('landlord') && (
                <Button size="sm" onClick={() => navigate('/landlord/add')}>
                  + Add Property
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
                <LayoutDashboard className="h-4 w-4 mr-1" /> Dashboard
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-1" /> Logout
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => navigate('/auth')}>
              <LogIn className="h-4 w-4 mr-1" /> Login
            </Button>
          )}
        </div>

        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t bg-card p-4 space-y-2">
          <Link to="/search" className="block py-2 text-sm" onClick={() => setOpen(false)}>Browse</Link>
          {user && hasRole('landlord') && (
            <Link to="/landlord" className="block py-2 text-sm" onClick={() => setOpen(false)}>My Listings</Link>
          )}
          {user && hasRole('admin') && (
            <Link to="/admin" className="block py-2 text-sm" onClick={() => setOpen(false)}>Admin</Link>
          )}
          {user ? (
            <>
              <Link to="/dashboard" className="block py-2 text-sm" onClick={() => setOpen(false)}>Dashboard</Link>
              <button className="block py-2 text-sm text-destructive" onClick={() => { signOut(); setOpen(false); }}>Logout</button>
            </>
          ) : (
            <Link to="/auth" className="block py-2 text-sm text-primary font-medium" onClick={() => setOpen(false)}>Login</Link>
          )}
        </div>
      )}
    </nav>
  );
}
