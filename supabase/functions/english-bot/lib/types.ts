export type ModuleType =
  | "READING_MODULE"
  | "VOCABULARY_MODULE"
  | "TRANSLATION_TEXTS"
  | "TRANSLATION_SENTENCES";

export interface ClarifyingParams {
  level?: string;      // "A2" | "B1" | "B2" | "C1" | "C2"
  ageGroup?: string;   // "teen" | "young_adult" | "adult"
  version?: string;    // "student" | "teacher"
}

export type State =
  | "REGISTERING"
  | "WAITING_REQUEST"
  | "CLARIFYING"
  | "CACHE_OFFER"
  | "POST_GENERATION"
  | "EDITING";

export interface SessionContext {
  last_request?: string;
  current_assignment?: string;
  current_assignment_teacher?: string;
  cached_assignment_id?: string;
  invite_pending?: boolean;
  module_type?: ModuleType;
  params?: ClarifyingParams;
}

export interface DbSession {
  telegram_id: number;
  state: State;
  context: SessionContext;
  updated_at: string;
}

export interface DbUser {
  telegram_id: number;
  username?: string;
  name: string;
  invited_by?: number;
  created_at: string;
}

export interface DbAssignment {
  id: string;
  telegram_id: number;
  level: string;
  topic: string;
  age_group: string;
  module_type: string;
  request_text: string;
  content: string;
  created_at: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TgMessage {
  message_id: number;
  from: TgUser;
  chat: { id: number };
  text?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message: TgMessage;
  data: string;
}

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}
