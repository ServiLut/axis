"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { AuthHeaders, Conversation, Inbox, Message, Account } from "@/lib/chatwoot-types";
import { chatwootService } from "@/lib/chatwoot";
import { resolvePsychologyChatAccount } from "@/lib/chatwoot-account";

export type ChatStatus = "open" | "resolved" | "pending" | "snoozed" | "all";

export function useChatwoot() {
  // Auth State
  const [auth, setAuth] = useState<AuthHeaders | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
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
    setAccountId(null);
    setAccountError(null);
    setMyAccounts([]);
    setSelectedChat(null);
    setSelectedInbox(null);
    localStorage.removeItem("cw_auth");
    localStorage.removeItem("cw_accounts");
    localStorage.removeItem("cw_account_id");
    setConversations([]);
    setMessages([]);
    setInboxes([]);
  }, []);

  const selectPsychologyAccount = useCallback((accounts: Account[]) => {
    const account = resolvePsychologyChatAccount(accounts, process.env.NEXT_PUBLIC_PSICOLOGOS_CHATWOOT_ACCOUNT_ID);
    setAccountId(account?.id ?? null);
    setMyAccounts(account ? [account] : []);
    setAccountError(account ? null : "No se pudo identificar la cuenta de Psicólogos en Colombia. Solicita a administración revisar tu acceso a WhatsApp.");
    if (account) localStorage.setItem("cw_account_id", String(account.id));
    else localStorage.removeItem("cw_account_id");
  }, []);

  // Load Session
  useEffect(() => {
    const savedAuth = localStorage.getItem("cw_auth");
    
    if (savedAuth) {
      let parsedAuth: AuthHeaders;
      try { parsedAuth = JSON.parse(savedAuth); } catch { handleLogout(); return; }
      setLoading(true);
      // Confirm current account access before loading conversations.
      chatwootService.getProfile(parsedAuth)
        .then(user => {
            const accounts = user?.accounts || [];
            selectPsychologyAccount(accounts);
            setAuth(parsedAuth);
            localStorage.removeItem("cw_accounts");
        })
        .catch(err => {
            if (err.message === "Unauthorized") handleLogout();
            else toast.error("No se pudo verificar WhatsApp. Intenta conectarte nuevamente.");
        })
        .finally(() => setLoading(false));
    }
  }, [handleLogout, selectPsychologyAccount]);

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
      const selectedAccount = resolvePsychologyChatAccount(userAccounts, process.env.NEXT_PUBLIC_PSICOLOGOS_CHATWOOT_ACCOUNT_ID);
      selectPsychologyAccount(userAccounts);
      setAuth(headers);

      localStorage.setItem("cw_auth", JSON.stringify(headers));
      localStorage.removeItem("cw_accounts");
      
      if (selectedAccount) toast.success("Conectado a WhatsApp de Psicólogos en Colombia");
    } catch (error) {
      console.error(error);
      toast.error("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const fetchInboxes = useCallback(async () => {
    if (!auth || !accountId) return;
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
      if (!auth || !accountId) return;
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
    if (!auth || !accountId) return;
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
      if (!auth || !accountId) return;
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
    if (!content.trim() || !selectedChat || !auth || !accountId) return;
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
    if (!auth || !accountId) return;
    
    fetchConversations(false);

    const interval = setInterval(() => {
      if (!isRefreshingRef.current) fetchConversations(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [auth, accountId, fetchConversations]);

  // Poll Messages
  useEffect(() => {
    if (!selectedChat || !auth || !accountId) return;
    fetchMessages(selectedChat);
    const interval = setInterval(() => {
      fetchMessages(selectedChat, true);
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedChat, auth, accountId, fetchMessages]);

  const toggleChatStatus = async (chatId: number, newStatus: string) => {
      if (!auth || !accountId) return;
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
    accountError,
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
