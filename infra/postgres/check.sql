DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'The vector extension is not installed';
    END IF;
    IF ('[1,2,3]'::vector <-> '[1,2,4]'::vector) <> 1 THEN
        RAISE EXCEPTION 'The vector distance check failed';
    END IF;
END
$$;

SELECT current_database() AS database, extversion AS vector_version
FROM pg_extension
WHERE extname = 'vector';
