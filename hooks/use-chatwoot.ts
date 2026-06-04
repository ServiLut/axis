"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { AuthHeaders, Conversation, Inbox, Message, Account } from "@/lib/chatwoot-types";
import { chatwootService } from "@/lib/chatwoot";

export type ChatStatus = "open" | "resolved" | "pending" | "snoozed" | "all";

export function useChatwoot() {
  // Auth State
  const [auth, setAuth] = useState<AuthHeaders | null>(null);
  const [accountId, setAccountId] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [myAccounts, setMyAccounts] = useState<Account[]>([]);

  // Data State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);

  // Selection State
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [selectedInbox, setSelectedInbox] = useState<number | null>(null);
  
  // NEW: Status Filter State
  const [conversationStatus, setConversationStatus] = useState<ChatStatus>("all");

  // UI State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const handleLogout = useCallback(() => {
    setAuth(null);
    localStorage.removeItem("cw_auth");
    localStorage.removeItem("cw_accounts");
    localStorage.removeItem("cw_account_id");
    setConversations([]);
    setMessages([]);
    setInboxes([]);
  }, []);

  // Load Session
  useEffect(() => {
    const savedAuth = localStorage.getItem("cw_auth");
    const savedAccounts = localStorage.getItem("cw_accounts");
    const savedAccountId = localStorage.getItem("cw_account_id");
    
    if (savedAuth) {
      const parsedAuth = JSON.parse(savedAuth);
      setAuth(parsedAuth);
      
      if (savedAccounts) setMyAccounts(JSON.parse(savedAccounts));
      if (savedAccountId) setAccountId(Number(savedAccountId));
      
      // Validate session
      chatwootService.getProfile(parsedAuth)
        .then(user => {
            const accounts = user?.accounts || [];
            setMyAccounts(accounts);
            localStorage.setItem("cw_accounts", JSON.stringify(accounts));
            
            if (accounts.length > 0) {
                 const currentId = savedAccountId ? Number(savedAccountId) : null;
                 const exists = accounts.find(a => a.id === currentId);
                 if (!exists) {
                    setAccountId(accounts[0].id);
                    localStorage.setItem("cw_account_id", String(accounts[0].id));
                 }
            }
        })
        .catch(err => {
            if (err.message === "Unauthorized") handleLogout();
        });
    }
  }, [handleLogout]);

  const handleLogin = async (
    e: React.FormEvent,
    email: string,
    pass: string,
  ) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { headers, data } = await chatwootService.signIn(email, pass);
      const userAccounts = data.data.accounts || data.data.user?.accounts || [];
      const firstAccountId = userAccounts[0]?.id || 1;

      setMyAccounts(userAccounts);
      setAccountId(firstAccountId);
      setAuth(headers);

      localStorage.setItem("cw_auth", JSON.stringify(headers));
      localStorage.setItem("cw_accounts", JSON.stringify(userAccounts));
      localStorage.setItem("cw_account_id", String(firstAccountId));
      
      toast.success("Conectado");
    } catch (error) {
      console.error(error);
      toast.error("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const fetchInboxes = useCallback(async () => {
    if (!auth) return;
    try {
      const data = await chatwootService.getInboxes(accountId, auth);
      setInboxes(data);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "Unauthorized") {
        handleLogout();
      } else {
        console.error(`Error cargando buzones (Account: ${accountId})`, error);
      }
    }
  }, [auth, accountId, handleLogout]);

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!auth) return;
      if (!silent) setIsRefreshing(true);

      try {
        const payload = await chatwootService.getConversations(
          accountId,
          auth,
          selectedInbox,
          conversationStatus // Pass status
        );
        setConversations(payload);
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "Unauthorized") {
          handleLogout();
        } else {
          console.error("Error cargando chats", error);
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [auth, accountId, selectedInbox, conversationStatus, handleLogout],
  );

  // Effect when Account Changes
  useEffect(() => {
    if (!auth) return;
    setConversations([]);
    setMessages([]);
    setSelectedChat(null);
    setSelectedInbox(null);
    setConversationStatus("all"); 
    
    fetchInboxes();
    
    localStorage.setItem("cw_account_id", String(accountId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, accountId]); // Only trigger on account/auth change to avoid resetting selection when fetchConversations updates

  const fetchMessages = useCallback(
    async (conversationId: number, silent = false) => {
      if (!auth) return;
      try {
        const payload = await chatwootService.getMessages(
          accountId,
          auth,
          conversationId,
        );
        setMessages((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(payload)) {
            shouldAutoScrollRef.current = true;
            return payload;
          }
          return prev;
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
          handleLogout();
        } else if (!silent) {
          console.error("Error msg", error);
        }
    }
    },
    [auth, accountId, handleLogout],
  );

  const sendMessage = async (content: string) => {
    if (!content.trim() || !selectedChat || !auth) return;
    try {
      await chatwootService.sendMessage(
        accountId,
        auth,
        selectedChat,
        content,
      );
      fetchMessages(selectedChat, true);
    } catch (error) {
      console.error(error);
      toast.error("Error enviando");
      throw error; 
    }
  };

  // Poll Conversations
  useEffect(() => {
    if (!auth) return;
    
    fetchConversations(false);

    const interval = setInterval(() => {
      if (!isRefreshingRef.current) fetchConversations(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [auth, fetchConversations]);

  // Poll Messages
  useEffect(() => {
    if (!selectedChat || !auth) return;
    fetchMessages(selectedChat);
    const interval = setInterval(() => {
      fetchMessages(selectedChat, true);
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedChat, auth, fetchMessages]);

  const toggleChatStatus = async (chatId: number, newStatus: string) => {
      if (!auth) return;
      try {
          await chatwootService.toggleStatus(accountId, auth, chatId, newStatus);
          toast.success(`Chat ${newStatus === 'resolved' ? 'resuelto' : 'reabierto'}`);
          fetchConversations(false); // Refresh list
          if (selectedChat === chatId && newStatus === 'resolved' && conversationStatus === 'open') {
              setSelectedChat(null); // Deselect if hiding
          }
      } catch {
          toast.error("Error al cambiar estado");
      }
  };

  return {
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
  };
}