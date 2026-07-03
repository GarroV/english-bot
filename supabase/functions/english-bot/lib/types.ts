export type ModuleType =
  | "READING_MODULE"
  | "VOCABULARY_MODULE"
  | "TRANSLATION_TEXTS"
  | "TRANSLATION_SENTENCES"
  | "VERB_SENTENCES";

// Canonical human-readable module names. Single source shared by the wizard and history views.
export const MODULE_LABELS: Record<ModuleType, string> = {
  READING_MODULE: "Reading",
  VOCABULARY_MODULE: "Vocabulary",
  TRANSLATION_TEXTS: "Перевод (тексты)",
  TRANSLATION_SENTENCES: "Перевод (предложения)",
  VERB_SENTENCES: "Глаголы (предложения)",
};

export interface ClarifyingParams {
  level?: string;      // "A2" | "B1" | "B2" | "C1" | "C2"
  ageGroup?: string;   // "teen" | "young_adult" | "adult"
  version?: string;    // "student" | "teacher"
  targetVerb?: string; // e.g. "must / have to"
}

// Allowed item types for an itemized homework question (live-doc Ф1a).
export type HomeworkItemType = "tf" | "mcq" | "open" | "gap" | "other";

// One structured homework question, produced by LLM itemization of free-text content (live-doc Ф1a).
export interface HomeworkItem {
  task_label: string;    // e.g. "Task 1 · True/False"
  question_text: string;
  item_type: HomeworkItemType;
}

// Token usage from an Anthropic response — metered per LLM call (#23 usage counter).
export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

// One eb_llm_usage row (subset read for the /usage readout).
export interface DbLlmUsage {
  ref_id: string;
  action: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export type State =
  | "REGISTERING"
  | "WAITING_REQUEST"
  | "CLARIFYING"
  | "WAITING_VERB"
  | "POST_GENERATION"
  | "EDITING";

export interface ReplyKeyboardMarkup {
  keyboard: { text: string }[][];
  resize_keyboard?: boolean;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
}

export interface SessionContext {
  last_request?: string;
  current_assignment?: string;
  current_assignment_teacher?: string;
  invite_pending?: boolean;
  module_type?: ModuleType;
  params?: ClarifyingParams;
  wizard_step?: "type" | "version" | "level" | "age";
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
  disabled_at?: string | null; // null = активен; дата = доступ отозван (мягко, обратимо)
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
  callback_data?: string;
  url?: string;
}
