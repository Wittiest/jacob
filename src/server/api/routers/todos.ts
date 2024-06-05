import { z } from "zod";
import { db } from "~/server/db/db";
import { TodoStatus } from "~/server/db/enums";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { type Todo } from "./events";
import { arch } from "os";

export const todoRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
      }),
    )
    .query(async ({ input: { projectId } }): Promise<Todo[]> => {
      const todos = await db.todos
        .where({ projectId, isArchived: false })
        .order({ position: "ASC" })
        .all();
      return todos;
    }),

  getById: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .query(async ({ input: { id } }): Promise<Todo> => {
      const todo = await db.todos.find(id);
      return todo;
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        description: z.string(),
        name: z.string(),
        status: z.nativeEnum(TodoStatus),
        issueId: z.number().nullable(),
        branch: z.string().nullable(),
      }),
    )
    .mutation(async ({ input }): Promise<Todo> => {
      const { projectId, description, name, status, issueId, branch } = input;
      const newTodo = {
        projectId,
        description,
        name,
        status,
        issueId,
        branch,
      };
      const createdTodo = await db.todos.selectAll().insert(newTodo);
      return createdTodo;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        description: z.string().optional(),
        name: z.string().optional(),
        status: z.nativeEnum(TodoStatus).optional(),
        issueId: z.number().optional(),
        branch: z.string().optional(),
        isArchived: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input: { id, ...updates } }): Promise<Todo> => {
      const updatedTodo = await db.todos.selectAll().find(id).update(updates);
      return updatedTodo;
    }),

  archive: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ input: { id } }): Promise<Todo> => {
      const archivedTodo = await db.todos
        .selectAll()
        .find(id)
        .update({ isArchived: true });
      return archivedTodo;
    }),

  updatePosition: protectedProcedure
    .input(z.array(z.number()))
    .mutation(async ({ input: ids }): Promise<void> => {
      await db.$transaction(async () => {
        // Update the position of each todo
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          if (!id) continue;
          await db.todos.find(id).update({ position: i + 1 });
        }
      });
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ input: { id } }): Promise<{ id: number }> => {
      await db.todos.find(id).delete();
      return { id };
    }),
});
