"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  LogOut,
  MessageSquare,
  RefreshCcw,
  Phone,
  Filter,
  Loader2,
  Building2,
  ChevronDown,
  Layers,
  CheckCircle2,
  Archive,
  MoreVertical,
  Search
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useChatwoot, ChatStatus } from "@/hooks/use-chatwoot";
import { Message } from "@/lib/chatwoot-types";

export default function MensajeriaPage() {
  const {
    auth,
    loading,
    myAccounts,
    accountId,
    setAccountId,
    conversations,
    messages,
    inboxes,
    selectedChat,
    setSelectedChat,
    selectedInbox,
    setSelectedInbox,
    conversationStatus,
    setConversationStatus,
    isRefreshing,
    shouldAutoScrollRef,
    handleLogin,
    handleLogout,
    sendMessage,
    fetchMessages,
    fetchInboxes,
    toggleChatStatus
  } = useChatwoot();

  const [newMessage, setNewMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Autoscroll UI effect
  useEffect(() => {
    if (scrollRef.current && shouldAutoScrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, shouldAutoScrollRef]);

  const onSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const tempMessage = newMessage;
    setNewMessage("");
    try {
      await sendMessage(tempMessage);
    } catch {
      setNewMessage(tempMessage); // Restore on error
    }
  };

  const renderMessageContent = (msg: Message) => {
    // 1. Mensajes de Sistema / Plantillas
    if (msg.message_type === 3) return msg.content || "📄 (Plantilla)";
    if (msg.message_type === 2)
      return (
        <span className="italic text-xs opacity-80">
          🤖 {msg.content || "Sistema"}
        </span>
      );

    // 2. Adjuntos (Imágenes, Audio, Video, Archivos)
    if (msg.attachments && msg.attachments.length > 0) {
      return (
        <div className="space-y-2">
          {msg.content && <p className="mb-1">{msg.content}</p>}
          {msg.attachments.map((att) => {
            if (att.file_type === "image") {
              return (
                <div key={att.id} className="rounded-lg overflow-hidden border bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={att.data_url} 
                    alt="Imagen adjunta" 
                    className="max-w-full h-auto max-h-[300px] object-cover"
                    loading="lazy"
                  />
                </div>
              );
            }
            if (att.file_type === "audio") {
               return (
                 <div key={att.id} className="min-w-[200px]">
                   <audio controls src={att.data_url} className="w-full h-8" />
                 </div>
               );
            }
             if (att.file_type === "video") {
               return (
                 <div key={att.id} className="rounded-lg overflow-hidden border bg-black">
                   <video controls src={att.data_url} className="max-w-full h-auto max-h-[300px]" />
                 </div>
               );
            }
            // Fallback para otros archivos
            return (
              <a 
                key={att.id} 
                href={att.data_url} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 p-2 rounded bg-gray-100 hover:bg-gray-200 transition-colors text-blue-600 underline text-xs"
              >
                📎 Archivo adjunto ({att.extension || "file"})
              </a>
            );
          })}
        </div>
      );
    }

    // 3. Texto plano
    return msg.content;
  };

  const activeChat = conversations.find((c) => c.id === selectedChat);
  const activeAccountName = myAccounts.find(a => a.id === accountId)?.name || `Cuenta #${accountId}`;
  const currentInboxName = selectedInbox 
    ? inboxes.find(i => i.id === selectedInbox)?.name 
    : "Todos los Canales";

  const filteredConversations = conversations.filter((chat) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const phone = chat.meta.sender.phone_number || "";
    const name = chat.meta.sender.name || "";
    return phone.toLowerCase().includes(term) || name.toLowerCase().includes(term);
  });

  const getStatusLabel = (status: ChatStatus) => {
      switch(status) {
          case 'open': return 'Abiertos';
          case 'resolved': return 'Resueltos';
          case 'pending': return 'Pendientes';
          case 'snoozed': return 'Pospuestos';
          case 'all': return 'Todos';
          default: return status;
      }
  };

  if (!auth)
    return (
      <LoginForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        handleLogin={(e) => handleLogin(e, email, password)}
        loading={loading}
      />
    );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background border-t">
      
      {/* 1. SIDEBAR: CUENTAS Y BUZONES (INSTANCIAS) */}
      <div className="w-[60px] md:w-[240px] border-r flex flex-col bg-muted/30">
        
        {/* SELECTOR DE CUENTA */}
        <div className="p-3 border-b hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between px-2 h-9 bg-white">
                  <span className="flex items-center gap-2 truncate">
                    <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate text-xs font-semibold">{activeAccountName}</span>
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[200px]" align="start">
                <DropdownMenuLabel>Mis Organizaciones</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {myAccounts.map(account => (
                  <DropdownMenuItem 
                    key={account.id} 
                    onClick={() => setAccountId(account.id)}
                    className="cursor-pointer"
                  >
                    <span className={accountId === account.id ? "font-bold text-blue-600" : ""}>
                      {account.name}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
        </div>

        {/* LISTA DE INSTANCIAS (BUZONES) */}
        <div className="flex-1 space-y-1 p-2 overflow-y-auto">
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                <div className="text-xs font-semibold text-muted-foreground hidden md:block uppercase tracking-wider">
                    Instancias
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 hidden md:flex"
                    onClick={() => fetchInboxes()}
                    title="Recargar buzones"
                >
                    <RefreshCcw className="w-3 h-3" />
                </Button>
            </div>
            
            <Button
                variant={selectedInbox === null ? "secondary" : "ghost"}
                className={`w-full justify-start gap-2 ${selectedInbox === null ? "bg-white shadow-sm border" : ""}`}
                onClick={() => setSelectedInbox(null)}
            >
                <Layers className="w-4 h-4 text-slate-500" />
                <span className="hidden md:inline font-medium">Todas</span>
            </Button>
            
            {inboxes.map(inbox => (
                <Button
                    key={inbox.id}
                    variant={selectedInbox === inbox.id ? "secondary" : "ghost"}
                    className={`w-full justify-start gap-2 text-xs h-9 ${selectedInbox === inbox.id ? "bg-white shadow-sm border border-blue-100" : ""}`}
                    onClick={() => setSelectedInbox(inbox.id)}
                    title={inbox.name}
                >
                    {/* Icono dinámico simple */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${selectedInbox === inbox.id ? 'bg-blue-500' : 'bg-slate-300'}`} />
                    
                    <span className={`hidden md:inline truncate ${selectedInbox === inbox.id ? 'text-blue-700 font-semibold' : 'text-slate-600'}`}>
                        {inbox.name}
                    </span>
                </Button>
            ))}
        </div>

        <div className="p-2 border-t mt-auto">
             <Button variant="ghost" size="icon" onClick={handleLogout} className="w-full md:justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50">
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Salir</span>
             </Button>
        </div>
      </div>

      {/* 2. LISTA DE CONVERSACIONES */}
      <div className="w-80 border-r flex flex-col bg-white">
        {/* HEADER DE CONVERSACIONES CON FILTRO DE ESTADO */}
        <div className="p-3 border-b bg-background shadow-sm flex flex-col gap-2 h-auto">
          <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-2 max-w-[150px]">
                <Filter className="w-3 h-3 shrink-0" />
                <span className="truncate" title={currentInboxName}>{currentInboxName}</span>
              </span>
              <Badge variant="secondary" className="h-5 text-[10px]">{filteredConversations.length}</Badge>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por número..."
              className="pl-8 h-8 text-xs bg-gray-50 border-gray-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* SELECTOR DE ESTADO (OPEN, RESOLVED, ALL) */}
          <div className="flex items-center justify-between">
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs w-full justify-between">
                       {getStatusLabel(conversationStatus)}
                       <ChevronDown className="w-3 h-3 opacity-50 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[200px]">
                    <DropdownMenuItem onClick={() => setConversationStatus('open')}>
                        <div className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                        Abiertos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConversationStatus('resolved')}>
                        <div className="w-2 h-2 rounded-full bg-gray-400 mr-2" />
                        Resueltos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConversationStatus('all')}>
                        <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                        Todos
                    </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
               {isRefreshing && <Loader2 className="w-3 h-3 animate-spin text-blue-500 ml-2" />}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {filteredConversations.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat.id)}
                className={`flex items-start gap-3 p-4 text-left transition-all border-b border-gray-100 hover:bg-gray-50 ${
                  selectedChat === chat.id
                    ? "bg-blue-50 border-l-4 border-l-blue-500"
                    : "border-l-4 border-l-transparent"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 text-white font-bold text-sm shadow-sm relative">
                  {chat.meta.sender.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={chat.meta.sender.thumbnail}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    chat.meta.sender.name.substring(0, 2).toUpperCase()
                  )}
                  {chat.status === 'resolved' && (
                      <div className="absolute -bottom-1 -right-1 bg-gray-500 text-white rounded-full p-0.5 border-2 border-white">
                          <CheckCircle2 className="w-3 h-3" />
                      </div>
                  )}
                </div>
                <div className="flex-1 overflow-hidden min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <span className="font-semibold text-sm truncate text-gray-900">
                      {chat.meta.sender.name}
                    </span>
                    {chat.unread_count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {chat.unread_count}
                      </span>
                    )}
                  </div>

                  {chat.meta.sender.phone_number && (
                    <div className="flex items-center gap-1 text-[11px] text-blue-600 font-medium mb-1">
                      <Phone className="w-3 h-3" />{" "}
                      {chat.meta.sender.phone_number}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground truncate opacity-80">
                    {chat.last_non_activity_message?.content ||
                      "Nueva conversación"}
                  </p>
                </div>
              </button>
            ))}
            {filteredConversations.length === 0 && !isRefreshing && (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No se encontraron chats
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 3. ZONA DE CHAT */}
      <div className="flex-1 flex flex-col bg-slate-50/50 relative">
        {selectedChat && activeChat ? (
          <>
            <div className="p-3 border-b flex items-center justify-between bg-white shadow-sm h-[52px]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  {activeChat.meta.sender.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-gray-800 flex items-center gap-2">
                    {activeChat.meta.sender.name}
                    {activeChat.status === 'resolved' && <Badge variant="secondary" className="text-[10px] h-4">Resuelto</Badge>}
                  </span>
                  {activeChat.meta.sender.phone_number && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {activeChat.meta.sender.phone_number} • ID: {selectedChat}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                             <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                         {activeChat.status === 'open' ? (
                             <DropdownMenuItem onClick={() => toggleChatStatus(selectedChat, 'resolved')}>
                                 <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                                 Resolver Chat
                             </DropdownMenuItem>
                         ) : (
                             <DropdownMenuItem onClick={() => toggleChatStatus(selectedChat, 'open')}>
                                 <Archive className="w-4 h-4 mr-2 text-blue-600" />
                                 Reabrir Chat
                             </DropdownMenuItem>
                         )}
                    </DropdownMenuContent>
                 </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchMessages(selectedChat)}
                    title="Recargar"
                  >
                    <RefreshCcw className="w-4 h-4 text-muted-foreground" />
                  </Button>
              </div>
            </div>

            <ScrollArea
              className="flex-1 p-4"
              onScrollCapture={() => {
                shouldAutoScrollRef.current = false;
              }}
            >
              <div className="space-y-4 flex flex-col pb-4">
                {messages.map((msg) => {
                  const isMe = msg.message_type === 1;
                  const isBot = msg.message_type === 2;

                  if (isBot)
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal text-muted-foreground bg-gray-50 border-gray-200"
                        >
                          {renderMessageContent(msg)}
                        </Badge>
                      </div>
                    );

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm shadow-sm ${
                          isMe
                            ? "bg-blue-600 text-white rounded-br-none"
                            : "bg-white border text-gray-800 rounded-bl-none"
                        }`}
                      >
                        {renderMessageContent(msg)}
                        <div
                          className={`text-[10px] mt-1 opacity-70 ${isMe ? "text-right" : "text-left"}`}
                        >
                          {new Date(msg.created_at * 1000).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <div className="p-4 bg-white border-t">
              {activeChat.status === 'resolved' ? (
                   <div className="flex flex-col items-center gap-2 p-2 bg-gray-50 rounded border border-dashed">
                       <p className="text-xs text-muted-foreground">Esta conversación está resuelta.</p>
                       <Button size="sm" variant="outline" onClick={() => toggleChatStatus(selectedChat, 'open')}>Reabrir conversación</Button>
                   </div>
              ) : (
                  <form onSubmit={onSendMessage} className="flex gap-2 items-end">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 bg-gray-50 border-gray-200 focus-visible:ring-blue-500"
                      autoFocus
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!newMessage.trim()}
                      className="bg-blue-600 hover:bg-blue-700 shadow-md"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4 bg-slate-50">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm">
              <MessageSquare className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-medium text-slate-400">
              Selecciona un chat para comenzar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Componente simple de Login
interface LoginFormProps {
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  handleLogin: (e: React.FormEvent) => void;
  loading: boolean;
}

function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  handleLogin,
  loading,
}: LoginFormProps) {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)] bg-slate-50">
      <Card className="w-full max-w-sm shadow-xl border-t-4 border-t-blue-600">
        <CardHeader>
          <CardTitle className="text-center flex flex-col items-center gap-2 text-xl">
            <MessageSquare className="w-10 h-10 text-blue-600" />
            <span>Mensajería</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Contraseña</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 h-10 font-semibold"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Conectar"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}