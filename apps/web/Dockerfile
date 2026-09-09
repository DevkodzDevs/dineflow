FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile=false
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_CLOUD_URL=""
ARG NEXT_PUBLIC_BOX=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_CLOUD_URL=$NEXT_PUBLIC_CLOUD_URL NEXT_PUBLIC_BOX=$NEXT_PUBLIC_BOX
RUN pnpm --filter @dineflow/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@dineflow/web", "start"]
