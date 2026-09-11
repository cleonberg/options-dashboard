// src/sync/safeQuery.js
export async function safeWhereEquals(table, indexName, value) {
  try {
    return await table.where(indexName).equals(value).toArray();
  } catch (err) {
    console.warn("[safeWhereEquals] indexed query failed, falling back to filter", { indexName, value, err });
    return await table.filter(item => item[indexName] === value).toArray();
  }
}
