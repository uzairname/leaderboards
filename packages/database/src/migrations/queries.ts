import { sql } from "drizzle-orm";


export const matches_trigger_query = sql.raw(`
    CREATE OR REPLACE FUNCTION "Matches_number_trigger_function"()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.number := COALESCE(
            (SELECT MAX(number) + 1
             FROM "Matches"
             WHERE ranking_id = NEW.ranking_id),
            1
        );
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- drop all triggers on Matches
    DO
    $$
    DECLARE
        trigger_record RECORD;
    BEGIN
        FOR trigger_record IN
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_table = 'Matches'
        LOOP
            EXECUTE 'DROP TRIGGER IF EXISTS ' || trigger_record.trigger_name || ' ON "Matches"';
        END LOOP;
    END;
    $$;
    
    CREATE OR REPLACE TRIGGER "Matches_number_trigger"
    BEFORE INSERT ON "Matches"
    FOR EACH ROW
    EXECUTE FUNCTION "Matches_number_trigger_function"();
    `)