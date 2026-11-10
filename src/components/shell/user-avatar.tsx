import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "./initials";

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={className ?? "size-[30px]"}>
      <AvatarFallback className="bg-teal-soft text-[13px] font-semibold text-teal">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
