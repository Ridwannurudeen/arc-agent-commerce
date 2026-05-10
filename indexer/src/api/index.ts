import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";

const app = new Hono();

const opts = {
  maxOperationDepth: 8,
  maxOperationTokens: 500,
  maxOperationAliases: 5,
};

app.use("/graphql", graphql({ db, schema }, opts));

export default app;
