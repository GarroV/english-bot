import { sendMessage } from "../lib/telegram.ts";
import {
  isAllowed,
  registerUser,
  setSession,
  validateInvite,
  useInvite,
  getInviteCreator,
} from "../lib/db.ts";
import type { TgMessage } from "../lib/types.ts";

const ADMIN_ID = Number(Deno.env.get("ADMIN_USER_ID")!);

const WELCOME =
  "Напиши запрос — и я сделаю полное домашнее задание по английскому.\n\n" +
  "Формат: *уровень, тема, возраст*\n\n" +
  "Например:\n" +
  "• A2, еда и рестораны, подросток\n" +
  "• B1, путешествия, взрослый\n" +
  "• C1, бизнес, студент";

// Handle the /start command — registers admin, resets state for existing users,
// or prompts new users for an invite code
export async function handleStart(message: TgMessage): Promise<void> {
  const { id, first_name, username } = message.from;
  const chatId = message.chat.id;

  // Admin bypasses invite requirement
  if (id === ADMIN_ID) {
    await registerUser(id, username, first_name);
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, `Добро пожаловать! ${WELCOME}`);
    return;
  }

  // Already registered
  if (await isAllowed(id)) {
    await setSession(id, "WAITING_REQUEST");
    await sendMessage(chatId, WELCOME);
    return;
  }

  // New user — request invite code
  await setSession(id, "REGISTERING");
  await sendMessage(chatId, "Привет! Для доступа введи инвайт-код:");
}

// Handle invite code submission — validates the code, registers the user, and grants access
export async function handleInviteCode(message: TgMessage): Promise<void> {
  const { id, first_name, username } = message.from;
  const chatId = message.chat.id;
  const code = message.text?.trim().toUpperCase() ?? "";

  if (!(await validateInvite(code))) {
    await sendMessage(chatId, "Неверный или уже использованный код. Попробуй ещё раз:");
    return;
  }

  const invitedBy = await getInviteCreator(code);
  await registerUser(id, username, first_name, invitedBy ?? undefined);
  await useInvite(code, id);
  await setSession(id, "WAITING_REQUEST");
  await sendMessage(chatId, `Доступ открыт! ${WELCOME}`);
}
