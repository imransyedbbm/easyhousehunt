import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { openRentRight, useDeal } from "@/lib/deals";
import { setActiveThread, threadKey, useMessageVersion } from "@/lib/messageStore";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  message: string;
  sender_name: string | null;
  sender_phone: string | null;
  created_at: string;
  read: boolean | null;
  read_at: string | null;
}

interface Pending {
  tempId: string;
  text: string;
  status: "sending" | "failed";
  created_at: string;
  name: string | null;
  phone: string | null;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ChatModal({
  propertyId,
  propertyTitle,
  receiverId,
  onClose,
  otherLabel = "Property owner",
}: {
  propertyId: string;
  propertyTitle: string;
  receiverId: string; // the other person in this conversation
  onClose: () => void;
  otherLabel?: string;
}) {
  const { user } = useAuth();
  const version = useMessageVersion();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [step, setStep] = useState<"intro" | "chat">("intro");
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dealState = useDeal(propertyId, receiverId);

  const fetchMessages = async () => {
    if (!user || !receiverId) {
      setLoaded(true);
      return;
    }
    const me = user.id;
    // Only the conversation between me and this one person, never other people's threads
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("property_id", propertyId)
      .or(`and(sender_id.eq.${me},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${me})`)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data as any);
      if (data.length > 0) setStep("chat");
    }
    setLoaded(true);
  };

  // Load, and reload whenever the notifier sees a new message or a read receipt
  useEffect(() => {
    void fetchMessages();
  }, [propertyId, receiverId, user?.id, version]);

  // Tell the notifier which conversation is open, so it does not toast for it
  useEffect(() => {
    setActiveThread(threadKey(propertyId, receiverId));
    return () => setActiveThread(null);
  }, [propertyId, receiverId]);

  // Opening the conversation marks what they sent me as read
  useEffect(() => {
    if (!user) return;
    const hasUnread = messages.some((m) => m.receiver_id === user.id && !m.read);
    if (hasUnread && document.visibilityState === "visible") {
      supabase
        .from("messages")
        .update({ read: true })
        .eq("property_id", propertyId)
        .eq("receiver_id", user.id)
        .eq("sender_id", receiverId)
        .not("read", "is", true)
        .then(() => {});
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const deliver = async (p: Pending) => {
    if (!user) return;
    setPending((prev) => prev.map((x) => (x.tempId === p.tempId ? { ...x, status: "sending" } : x)));
    const { data, error } = await supabase
      .from("messages")
      .insert({
        property_id: propertyId,
        sender_id: user.id,
        receiver_id: receiverId,
        message: p.text,
        sender_name: p.name,
        sender_phone: p.phone,
        read: false,
      })
      .select()
      .single();
    if (error || !data) {
      console.error("Message insert error:", error);
      setPending((prev) => prev.map((x) => (x.tempId === p.tempId ? { ...x, status: "failed" } : x)));
      return;
    }
    setPending((prev) => prev.filter((x) => x.tempId !== p.tempId));
    setMessages((prev) => (prev.some((m) => m.id === (data as any).id) ? prev : [...prev, data as any]));
  };

  const send = async () => {
    const text = newMessage.trim();
    if (!text || !user) return;
    if (!receiverId) {
      alert("This property has no owner account yet.");
      return;
    }
    const earlier = [...messages].reverse().find((m) => m.sender_id === user.id && (m.sender_name || m.sender_phone));
    const p: Pending = {
      tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      status: "sending",
      created_at: new Date().toISOString(),
      name: senderName.trim() || earlier?.sender_name || user.email?.split("@")[0] || null,
      phone: senderPhone.trim() || earlier?.sender_phone || null,
    };
    setNewMessage("");
    setStep("chat");
    setPending((prev) => [...prev, p]);
    await deliver(p);
  };

  const lastMessage = messages[messages.length - 1];
  const otherName = messages.find((m) => m.sender_id === receiverId)?.sender_name;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 text-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ height: "560px" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center font-bold">
            {propertyTitle?.[0] ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{propertyTitle}</p>
            <p className="text-xs text-gray-400 truncate">
              {otherLabel}
              {otherLabel === "Tenant" && otherName ? ` · ${otherName}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {!loaded && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading...</div>
        )}

        {/* Intro */}
        {loaded && step === "intro" && (
          <div className="flex-1 flex flex-col justify-center px-6 space-y-4">
            <p className="text-center text-gray-300 text-sm">
              Introduce yourself to the owner of<br />
              <span className="text-orange-400 font-semibold">{propertyTitle}</span>
            </p>
            <div>
              <label className="text-xs text-gray-400">Your Name</label>
              <input className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g. Rahul Sharma" maxLength={100} value={senderName} onChange={(e) => setSenderName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Phone Number</label>
              <input className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g. 9876543210" inputMode="tel" maxLength={20} value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Message *</label>
              <textarea className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 h-20 resize-none"
                placeholder="Hi, I'm interested in this property. Is it still available?"
                maxLength={2000} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
            </div>
            <button onClick={send} disabled={!newMessage.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 py-3 rounded-xl font-semibold">
              Send Enquiry
            </button>
          </div>
        )}

        {/* Chat */}
        {loaded && step === "chat" && (
          <>
            <DealBar state={dealState} otherLabel={otherLabel === "Tenant" ? "the tenant" : "the owner"} />
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {messages.map((msg) => {
                const isMine = msg.sender_id === user?.id;
                const isLast = msg.id === lastMessage?.id && pending.length === 0;
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${isMine ? "bg-orange-500 text-white rounded-br-sm" : "bg-gray-700 text-gray-100 rounded-bl-sm"}`}>
                      {!isMine && msg.sender_name && <p className="text-xs text-orange-300 font-semibold mb-1">{msg.sender_name}</p>}
                      {!isMine && msg.sender_phone && <p className="text-xs text-gray-400 mb-1">📞 {msg.sender_phone}</p>}
                      <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      <p className={`text-xs mt-1 ${isMine ? "text-orange-200" : "text-gray-500"}`}>{clock(msg.created_at)}</p>
                      {isMine && (
                        <p className="text-[11px] text-orange-100">
                          {msg.read ? `✓✓ Seen${msg.read_at ? " " + clock(msg.read_at) : ""}` : "✓ Delivered"}
                          {isLast ? " · waiting for a reply" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {pending.map((p) => (
                <div key={p.tempId} className="flex justify-end">
                  <div className="max-w-xs px-3 py-2 rounded-2xl rounded-br-sm text-sm bg-orange-500/70 text-white">
                    <p className="whitespace-pre-wrap break-words">{p.text}</p>
                    {p.status === "sending" ? (
                      <p className="text-[11px] mt-1 text-orange-100">Sending…</p>
                    ) : (
                      <button onClick={() => deliver(p)} className="text-[11px] mt-1 text-red-100 underline">
                        Not sent · tap to retry
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="px-3 py-3 border-t border-gray-700 flex gap-2">
              <input
                className="flex-1 bg-gray-800 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Type a message..."
                maxLength={2000}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              />
              <button onClick={() => void send()} disabled={!newMessage.trim()}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold">
                ➤
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DealBar({ state, otherLabel }: { state: ReturnType<typeof useDeal>; otherLabel: string }) {
  const { deal, busy, error, agree, withdraw, mine, theirs } = state;
  const btn = "text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50 whitespace-nowrap";

  let body;
  if (deal?.agreed_at) {
    body = (
      <>
        <p className="text-xs text-green-300 flex-1">✅ Deal agreed by both of you</p>
        <button onClick={() => openRentRight(deal.id)} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>
          ⚖️ Create agreement
        </button>
      </>
    );
  } else if (mine) {
    body = (
      <>
        <p className="text-xs text-gray-300 flex-1">🤝 You marked the deal as agreed. Waiting for {otherLabel} to confirm.</p>
        <button onClick={withdraw} disabled={busy} className={`${btn} text-gray-300 hover:text-white underline`}>Undo</button>
      </>
    );
  } else if (theirs) {
    body = (
      <>
        <p className="text-xs text-orange-200 flex-1">🤝 {otherLabel[0].toUpperCase() + otherLabel.slice(1)} has agreed to the deal.</p>
        <button onClick={agree} disabled={busy} className={`${btn} bg-orange-500 hover:bg-orange-600 text-white`}>Confirm deal</button>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-xs text-gray-400 flex-1">Agreed on rent and terms?</p>
        <button onClick={agree} disabled={busy} className={`${btn} bg-gray-700 hover:bg-gray-600 text-white`}>🤝 Mark deal agreed</button>
      </>
    );
  }

  return (
    <div className="px-4 py-2 border-b border-gray-700 bg-gray-800/60">
      <div className="flex items-center gap-2">{body}</div>
      {error && <p className="text-[11px] text-red-300 mt-1">{error}</p>}
    </div>
  );
}
