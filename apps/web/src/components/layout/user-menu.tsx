import { LogOut, UserRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';

interface UserMenuProps {
  fullName: string;
  username: string;
  onLogout: () => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts.at(-1) ?? '';
  return last.slice(0, 2).toUpperCase();
}

/** Header user menu: display name + sign-out action (S1-S7 header chrome). */
export function UserMenu({ fullName, username, onLogout }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <Avatar className="size-7">
            <AvatarFallback>{initialsOf(fullName) || <UserRound className="size-4" />}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{fullName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium">{fullName}</span>
            <span className="text-muted-foreground text-xs">@{username}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} variant="destructive">
          <LogOut />
          {vi.common.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
