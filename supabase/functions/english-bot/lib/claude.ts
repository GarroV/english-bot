// Generation engine lives in the shared module so the bot and Folio (folio-generate)
// run the identical prompts/logic. See supabase/functions/_shared/generate.ts.
export { generateModuleContent, generateTeacherGuide, applyEdit, MODEL } from "../../_shared/generate.ts";
