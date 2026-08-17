import React from "react";
import { Link, useLocation } from "wouter";
import { PublicUser } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import {
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  Play,
  Info,
  BookOpen
} from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotifications } from "@/hooks/use-followups";
import { useAppSettings } from "@/hooks/use-settings";
import { formatSaudiDateTime } from "@/lib/datetime";
import clinicLogo from "@/assets/clinic-logo.jpeg";

interface HeaderProps {
  user: PublicUser;
}

export function Header({ user }: HeaderProps) {
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();
  const { settings } = useAppSettings();
  const { data: notifications } = useNotifications();
  const notificationItems = notifications?.items ?? [];
  const notificationCount = notifications?.totalCount ?? 0;

  const roleName =
    user.role === "ADMIN"
      ? "مدير النظام"
      : user.role === "DOCTOR"
      ? "طبيب"
      : "مساعد";

  const navItems = [
    { label: "الرئيسية", path: "/" },
    { label: "المرضى", path: "/patients" },
    // Backend enforces this too; hiding the tab avoids a dead page for
    // users without the financial-visibility permission.
    ...(user.canViewFinancials ? [{ label: "المالية", path: "/finance" }] : []),
    ...(user.role === "ADMIN" ? [{ label: "الإعدادات", path: "/settings" }] : []),
  ];

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => setLocation("/login"),
    });
  };

  const startTour = () => {
    window.dispatchEvent(new CustomEvent('start-tour'));
  };

  const showShortcuts = () => {
    window.dispatchEvent(new CustomEvent('show-shortcuts'));
  };

  const showQuickHelp = () => {
    window.dispatchEvent(new CustomEvent('show-quick-help'));
  };

  return (
    <header className="bg-card border-b border-border sticky top-0 z-40 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Right: Logo & Name (admin-configurable via app settings) */}
        <div className="flex items-center gap-3">
          <img
            src={settings.clinicLogo ?? clinicLogo}
            alt="Clinic Logo"
            className="h-11 w-10 rounded-md object-contain"
          />
          <span className="font-bold text-lg text-foreground hidden sm:block">
            {settings.systemName}
          </span>
        </div>

        {/* Center: Tabs */}
        <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2 h-full" data-testid="nav-tabs" id="tour-nav-tabs">
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location === "/"
                : location.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`px-4 h-full flex items-center border-b-2 font-medium transition-colors hover:text-primary ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Left: Actions */}
        <div className="flex items-center gap-2">
          {/* Help Menu */}
          <DropdownMenu dir="rtl">
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary" id="tour-help-icon">
                    <HelpCircle className="h-5 w-5" />
                    <span className="sr-only">المساعدة والجولة التعريفية</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>المساعدة والجولة التعريفية</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>المساعدة</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={startTour} className="cursor-pointer gap-2">
                <Play className="h-4 w-4" />
                <span>ابدأ الجولة التعريفية</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={showQuickHelp} className="cursor-pointer gap-2">
                <Info className="h-4 w-4" />
                <span>مساعدة سريعة</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={showShortcuts} className="cursor-pointer gap-2">
                <BookOpen className="h-4 w-4" />
                <span>شرح الاختصارات</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <DropdownMenu dir="rtl">
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-primary relative"
                    data-testid="button-notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {notificationCount > 0 ? (
                      <span
                        className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[18px] text-center font-bold notranslate"
                        data-testid="badge-notification-count"
                      >
                        {notificationCount > 99 ? "+99" : notificationCount}
                      </span>
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>التنبيهات</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
              {notificationItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Bell className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">لا توجد تنبيهات حاليًا</p>
                </div>
              ) : (
                <>
                  <DropdownMenuLabel>التنبيهات ({notificationCount})</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notificationItems.map((item, idx) => (
                    <DropdownMenuItem
                      key={`${item.kind}-${item.followupId ?? item.implantCaseId ?? idx}`}
                      className="cursor-pointer flex flex-col items-start gap-0.5 py-2"
                      onClick={() => setLocation(`/patients/${item.patientId}`)}
                      data-testid={`notification-item-${idx}`}
                    >
                      <span className="text-sm font-medium notranslate">{item.patientName}</span>
                      <span className="text-xs text-muted-foreground">{item.reason}</span>
                      {item.dueAt ? (
                        <span className="text-[11px] text-muted-foreground">
                          {formatSaudiDateTime(item.dueAt)}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2 hover:bg-muted">
                <UserAvatar
                  fullName={user.fullName}
                  avatarData={user.avatarData}
                  size="sm"
                />
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium leading-none text-foreground">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{roleName}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 sm:hidden">
                <p className="text-sm font-medium leading-none text-foreground">{user.fullName}</p>
                <p className="text-xs text-muted-foreground mt-1">{roleName}</p>
              </div>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer gap-2 focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="h-4 w-4" />
                <span>تسجيل الخروج</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Nav Menu */}
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {navItems.map((item) => (
                <DropdownMenuItem key={item.path} asChild>
                  <Link href={item.path} className="w-full cursor-pointer">
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
