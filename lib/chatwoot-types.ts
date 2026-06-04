export interface AuthHeaders {
  "access-token": string;
  client: string;
  uid: string;
}

export interface Account {
  id: number;
  name: string;
  role: number;
}

export interface Conversation {
  id: number;
  inbox_id: number;
  meta: {
    sender: {
      name: string;
      thumbnail: string;
      phone_number: string;
      email: string;
    };
  };
  messages: Message[];
  status: string;
  unread_count: number;
  last_non_activity_message?: {
    content: string;
    created_at: number;
  };
}

export interface Message {
  id: number;
  content: string;
  message_type: number;
  created_at: number;
  sender?: {
    name: string;
    thumbnail?: string;
  };
  attachments?: {
    id: number;
    message_id: number;
    file_type: string;
    account_id: number;
    extension: string | null;
    data_url: string;
    thumb_url: string;
    file_size: number;
  }[];
  private: boolean;
  content_attributes?: Record<string, unknown>;
}

export interface Inbox {
  id: number;
  name: string;
  channel_type: string;
  avatar_url: string;
}

export interface CustomView {
  id: number;
  name: string;
  filter_type: number;
  query: Record<string, unknown>;
}

export interface LoginResponse {
  data: {
    accounts?: Account[];
    user?: {
      accounts: Account[];
    };
  };
}
