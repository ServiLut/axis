import {
  AuthHeaders,
  Conversation,
  Inbox,
  LoginResponse,
  Message,
} from "@/lib/chatwoot-types";

const CHATWOOT_BASE_URL = "/chatwoot-api";

export const chatwootService = {
  async signIn(
    email: string,
    password: string,
  ): Promise<{ headers: AuthHeaders; data: LoginResponse }> {
    const res = await fetch(`${CHATWOOT_BASE_URL}/auth/sign_in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Login failed:", res.status, text);
      throw new Error(
        `Error ${res.status}: Credenciales inválidas o servidor no disponible`,
      );
    }

    const data = await res.json();
    const headers: AuthHeaders = {
      "access-token": res.headers.get("access-token") || "",
      client: res.headers.get("client") || "",
      uid: res.headers.get("uid") || "",
    };

    if (!headers["access-token"]) throw new Error("No token received");

    return { headers, data };
  },

  async getProfile(auth: AuthHeaders): Promise<LoginResponse["data"]["user"]> {
    const res = await fetch(`${CHATWOOT_BASE_URL}/api/v1/profile`, {
      headers: auth as unknown as HeadersInit,
    });
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) throw new Error("Failed to fetch profile");
    const data = await res.json();
    return data;
  },

  async getInboxes(accountId: number, auth: AuthHeaders): Promise<Inbox[]> {
    const res = await fetch(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/inboxes`,
      {
        headers: auth as unknown as HeadersInit,
      },
    );

    if (res.status === 404) return [];
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) throw new Error("Failed to fetch inboxes");

    const data = await res.json();
    return data.payload || [];
  },

  // --- AQUÍ ESTÁ EL CAMBIO IMPORTANTE ---
  async getConversations(
    accountId: number,
    auth: AuthHeaders,
    inboxId: number | null,
    status: string = "open", // <--- Nuevo parámetro (por defecto 'open')
  ): Promise<Conversation[]> {
    // Quitamos el status=open fijo de la URL base
    let url = `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations?sort_by=last_activity_at`;

    // Siempre agregamos el filtro de estado (incluso si es 'all')
    if (status) {
      url += `&status=${status}`;
    }

    // Agregamos el filtro de buzón si existe
    if (inboxId) {
      url += `&inbox_id=${inboxId}`;
    }

    const res = await fetch(url, {
      headers: auth as unknown as HeadersInit,
    });

    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) throw new Error(`Error fetching conversations: ${res.status}`);

    const data = await res.json();
    return data.data?.payload || data.payload || [];
  },

  async getMessages(
    accountId: number,
    auth: AuthHeaders,
    conversationId: number,
  ): Promise<Message[]> {
    const res = await fetch(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages?limit=100`,
      {
        headers: auth as unknown as HeadersInit,
      },
    );
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) throw new Error("Failed to fetch messages");
    const data = await res.json();
    return data.payload || [];
  },

  async sendMessage(
    accountId: number,
    auth: AuthHeaders,
    conversationId: number,
    content: string,
  ): Promise<void> {
    const res = await fetch(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth as unknown as HeadersInit),
        },
        body: JSON.stringify({
          content,
          message_type: "outgoing",
        }),
      },
    );
    if (!res.ok) throw new Error("Failed to send message");
  },

  // Función extra para cambiar estado (Resolver/Reabrir)
  async toggleStatus(
    accountId: number,
    auth: AuthHeaders,
    conversationId: number,
    status: string,
  ): Promise<void> {
    const res = await fetch(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth as unknown as HeadersInit),
        },
        body: JSON.stringify({ status }),
      },
    );
    if (!res.ok) throw new Error("Failed to toggle status");
  },
};
