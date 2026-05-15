-- Add module_type to distinguish READING, VOCABULARY, and TRANSLATION caches
alter table eb_assignments
  add column module_type text default 'READING_MODULE';
