"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    try {
      await queryInterface.sequelize.query("CREATE EXTENSION IF NOT EXISTS vector;");

      const [columns] = await queryInterface.sequelize.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'rag_chunks' AND column_name = 'embedding_vector';
      `);

      if (!columns.length) {
        await queryInterface.sequelize.query(`
          ALTER TABLE rag_chunks ADD COLUMN embedding_vector vector(1536);
        `);
      }

      await queryInterface.sequelize.query(`
        UPDATE rag_chunks
        SET embedding_vector = embedding::text::vector
        WHERE embedding IS NOT NULL
          AND embedding_vector IS NULL
          AND jsonb_typeof(embedding) = 'array';
      `);

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS rag_chunks_embedding_vector_hnsw_idx
        ON rag_chunks
        USING hnsw (embedding_vector vector_cosine_ops)
        WHERE embedding_vector IS NOT NULL;
      `);
    } catch (error) {
      console.warn(
        "[migration] pgvector indisponível — mantendo fallback JSONB:",
        error.message
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS rag_chunks_embedding_vector_hnsw_idx;"
    ).catch(() => {});
    await queryInterface.sequelize.query(
      "ALTER TABLE rag_chunks DROP COLUMN IF EXISTS embedding_vector;"
    ).catch(() => {});
  },
};
