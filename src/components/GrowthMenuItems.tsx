import { Download, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useInstallApp } from "@/lib/install";
import { inviteOwnerUrl } from "@/lib/invite";

/** "Install app" + "Invite an owner" rows for the account menus. */
export default function GrowthMenuItems({ onDone }: { onDone: () => void }) {
  const { canInstall, install } = useInstallApp();
  return (
    <div className="border-t border-gray-700">
      <a href={inviteOwnerUrl()} target="_blank" rel="noopener noreferrer" onClick={onDone}
        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-green-400" /> Invite an owner · free listing
      </a>
      {canInstall && <InstallButton install={install} onDone={onDone} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2" />}
    </div>
  );
}

export function InstallButton({ install, onDone, className, label = "Install the app" }: {
  install: () => Promise<string>; onDone?: () => void; className?: string; label?: string;
}) {
  return (
    <button
      className={className}
      onClick={async () => {
        const r = await install();
        onDone?.();
        if (r === "ios") toast("Install on iPhone", { description: "Tap the Share button in Safari, then “Add to Home Screen”.", duration: 8000 });
        if (r === "accepted") toast.success("Installed! Find EasyHouseHunt on your home screen.");
      }}
    >
      <Download className="h-4 w-4 text-orange-400" /> {label}
    </button>
  );
}

/** Small footer link, shown only when installing is possible. */
export function InstallLink({ className }: { className?: string }) {
  const { canInstall, install } = useInstallApp();
  if (!canInstall) return null;
  return <InstallButton install={install} className={className} label="Install app" />;
}
