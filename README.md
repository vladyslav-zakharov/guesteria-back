# guesteria-back
The StayHub API. StayHub is a mobile web hotel-booking app on the LiteAPI sandbox with Guest Hub, a per-booking AI concierge on Gemini through Vertex AI. Built on a Fastify template (Awilix DI, Prisma, Zod, Swagger), Node 22, npm.

The reviewer entry point is the [`guesteria-front` README](https://github.com/vladyslav-zakharov/guesteria-front). Infrastructure: [`guesteria-infra`](https://github.com/vladyslav-zakharov/guesteria-infra).

## 🧭 What the API does

| Module | Prefix | Endpoints |
| --- | --- | --- |
| `application` | `/api` | `GET /ping` health check |
| `auth` | `/api/auth` | `POST /sign-up`, `POST /sign-in`, `POST /sign-out`, `GET /me` |
| `places` | `/api/places` | Destination autocomplete |
| `hotels` | `/api/hotels` | Search with rates (`GET /`), hotel details and room rates (`GET /:hotelId`) |
| `bookings` | `/api/bookings` | `POST /prebook`, `POST /` (book), `GET /` (own bookings), `GET /:bookingId` |
| `chat` | `/api/bookings` | `GET` / `POST /:bookingId/messages`: the Guest Hub concierge |

Swagger UI is served only when `DOCS_PASSWORD` is set, behind basic auth.

**Auth.** Sign-up and sign-in set a JWT in an `access_token` cookie (`httpOnly`, `SameSite=Lax`, `Secure` in production, 7 days). The frontend calls the API through its own `/api` rewrite, so the cookie is first-party. Bookings and chat are owner-scoped: another user's booking returns 404.

**LiteAPI client** (`src/lib/liteapi/`). The key goes only in the `X-API-Key` header and is never logged; upstream errors are mapped to our own messages. Each call has a timeout: 10 s for data, 12 s for rates, 65 s for prebook, 70 s for book. Places and hotel data are cached in memory. Search-side calls (places, hotels, rates, hotel details) share a throttle of 3 req/s per instance, below the sandbox key's 5 req/s; prebook and book bypass it so a search burst cannot starve a booking. Cloud Run runs at most one instance.

**AI concierge** (`src/modules/chat/`, `src/lib/ai/`). Each question is checked in this order: booking ownership, the kill switch (`AI_DAILY_LIMIT <= 0` or no `GCP_PROJECT_ID` → 503), the global ceiling across all users (`AI_GLOBAL_DAILY_LIMIT` per UTC day), then the per-user daily cap (`AI_DAILY_LIMIT` per UTC day, counted before the model call, so a failed call still counts). Infra adds a billing kill switch that disables the Vertex AI API (see `guesteria-infra`).

## 🔧 Environment variables
Declared and validated in `src/plugins/env.ts`; copy `.env.example` to `.env` and fill in your own values. Never commit `.env`.

| Name | Required | Meaning |
| --- | --- | --- |
| `NODE_ENV` | yes | `development`, `production` or `test` |
| `DATABASE_URL` | yes | Postgres URL the app uses |
| `DIRECT_URL` | for Prisma CLI | Direct (non-pooled) Postgres URL for migrations; read by `schema.prisma`, not the env plugin |
| `APPLICATION_SECRET` | yes | JWT signing secret, at least 32 characters |
| `APPLICATION_URL` | yes | Public URL of the API (required by the schema; no code reads it yet) |
| `PORT` | yes | HTTP port (3001 locally) |
| `HOST` | no | Bind address, default `0.0.0.0` |
| `FRONTEND_URL` | yes | Frontend origin, used for CORS |
| `DOCS_PASSWORD` | no | Enables Swagger UI behind basic auth |
| `LITEAPI_API_KEY` | yes | LiteAPI sandbox key |
| `LITEAPI_DATA_URL`, `LITEAPI_BOOK_URL` | no | LiteAPI base URLs (defaults point at v3.0) |
| `LITEAPI_CURRENCY`, `LITEAPI_GUEST_NATIONALITY` | no | Currency and guest nationality sent to LiteAPI (defaults `EUR`, `UA`) |
| `GCP_PROJECT_ID` | for chat | GCP project for Vertex AI; without it the concierge answers 503 |
| `AI_MODEL`, `AI_LOCATION` | no | Gemini model and Vertex location (default `global`) |
| `AI_DAILY_LIMIT` | no | Concierge calls per user per UTC day; `0` turns the concierge off |
| `AI_GLOBAL_DAILY_LIMIT` | no | Concierge calls across all users per UTC day |
| `AI_TIMEOUT_MS` | no | Timeout for one model call |
| `TRUST_PROXY_HOPS` | no | Trusted proxy hops for the client IP: `0` locally, `2` in production (Vercel rewrite → Google Front End → Cloud Run) |

Locally, Vertex AI uses your Application Default Credentials (`gcloud auth application-default login`).

## 🛠️ Technology Stack:
- [TypeScript](https://www.typescriptlang.org/) - programming language;
- [Node.js](https://nodejs.org/en) - JavaScript runtime;
- [Fastify](https://fastify.dev/docs/latest/Guides/Getting-Started/) - HTTP framework;
- [Zod](https://zod.dev) - validation;
- [Swagger](https://swagger.io/) - API documentation;
- [Awilix](https://github.com/jeffijoe/awilix) - Dependency Injection container;
- [PostgreSQL](https://www.postgresql.org/) - relational database;
- [Prisma](https://www.prisma.io/docs/getting-started) - database ORM;
- [Vitest](https://vitest.dev/) - testing framework.

## 📌 Getting Started

### 🚀 Project Launch
Requires Node 22 and Docker.
1. `npm install` - install the dependencies locally;
2. Create a `.env` file from `.env.example` and fill in your own values (at least `APPLICATION_SECRET` and `LITEAPI_API_KEY`);
3. Launch Docker Compose with the `docker compose up` command. It starts the dev Postgres (published on `localhost:5435`) and the API on `localhost:3001`.

To run the API on the host instead, start only the database (`docker compose up -d postgresdb`), point `DATABASE_URL` and `DIRECT_URL` at `localhost:5435`, and run `npm run start:dev`.

### ⚙️ Running Prisma Migrations
Since both the Node.js server and PostgreSQL database run inside Docker containers, the database connection uses the [docker compose network](https://docs.docker.com/compose/networking/).
Inside the Node.js container, use `postgresdb:5432` as the database host.

To run migrations from a host machine:
1. Launch docker containers - `docker compose up`;
2. Update the `.env` file, changing the `DATABASE_URL` and `DIRECT_URL` host from `postgresdb:5432` to `localhost:5435`;
3. Run `npm run prisma:migrate:create` - create SQL migration file;
4. Name the new migration and verify the SQL code generated;
5. Run `npm run prisma:migrate:apply` - apply the migration to the database;
6. Revert the URLs in `.env` back to `postgresdb:5432` so that the Node.js container can connect to the database after a rebuild.

### 🧪 Running Tests
Vitest. Use the `:ci` scripts: they run once and exit. The plain `test:unit` / `test:int` scripts start watch mode.

#### Unit Tests
1. `npm run test:unit:ci` - run all unit tests once;
2. `npm run test:unit:ui` - launch the interactive UI test runner.

#### Integration Tests
Integration tests run against a separate Postgres on `localhost:5436` (settings in `.env.test`):
1. `docker compose -f docker-compose.test.yml up -d` - start the test database;
2. `npm run test:int:ci` - run the integration tests once.

## ⚙ Key Features

### 🧩 Dependency Injection

This template utilizes **Awilix** for Dependency Injection (DI), which helps in managing application dependencies efficiently.

#### Why Use Dependency Injection?
- **Encapsulation & Maintainability**: Keeps the code modular and easier to maintain.
- **Testability**: Improves unit testing by allowing easy mocking of dependencies.
- **Cleaner Architecture**: Enhances readability and organization.
- **Implemented Patterns**: Uses Dependency Inversion, Inversion of Control, and Singleton.

#### How Awilix is Used

Awilix is configured as a Fastify plugin, allowing services, handlers, repositories and custom dependencies to be injected dynamically. It enables clean and organized code by managing dependencies automatically. The DI container is registered in `src/plugins/awilix.ts`.

#### DI Usage Example:

Define an email service abstraction layer in the lib directory.

`src/lib/emails/index.ts`
```typescript
export type EmailService = {
    sendEmail: (emailRecipient: string, p: EmailOptions) => Promise<void>;
};

export const createEmailService = (
    config: EnvConfig,
    log: FastifyBaseLogger
): EmailService => {
    const emailProvider = new EmailProvider({ secretKey: config.secretKey });

    return {
        sendEmail: async (emailRecipient, email) => {
            ...
            await emailProvider.sendEmail(emailRecipient, email);
            ...
        },
    };
};
```
Register the email service in the DI container.

`src/plugins/awilix.ts`
```typescript
// Register dependencies from plugins and libraries
fastify.di.register({
    log: asValue(fastify.log),
    config: asValue(fastify.config),
    emailService: asFunction(createEmailService),
});
```
Use the email service by specifying its name in the function parameters.

`src/modules/user/user.service.ts`
```typescript
export type UserService = {
    sendWelcomeEmail: (
        userId:string,
    ) => Promise<UserEventsResponseBody>;
};

export const createUserService = (
    emailService: EmailService,
): UserService => ({
    sendWelcomeEmail: async (userId) => {
        ...
        await emailService.sendEmail(email, {...});
        ...
    },
});

addDIResolverName(createService, "userService"); // Define a unique DI container name for automatic loading.
```

### 🐳 Docker
This template provides a `Dockerfile` for building a production-ready Node.js image and a `docker-compose.yml` file for local development. By default, Docker Compose starts two services:

1. **Node.js** – Runs the application inside a container using the provided Dockerfile.
2. **PostgreSQL** – Spins up a PostgreSQL database.

Is is possible can add more services (for example, Redis) by including them in `docker-compose.yml` and configuring their networking and environment variables. 
This setup allows to quickly bootstrap a fully containerized development environment without installing any dependencies locally other than Docker itself.

### 📖 REST API Documentation

This template includes **Swagger** for automatic API documentation generation, making it easy to document REST API endpoints.

#### Automatic Generation

- **Swagger Integration**: The Fastify Swagger plugin automatically generates API documentation from route schemas.
- **Route Description**: It is possible to categorize endpoints by tags and describe them in the route schema.
- **Authorization**: Secure the documentation with a password.

Example route with Swagger options:
```typescript
fastify.post(
    "/sign-up",
    {
        schema: {
            tags: ["auth"], // Categorizes the route under the specified tags.
            summary: "Create a new user account".
            description: "Create a new user within the system",
            body: signUpBodySchema,
            response: {
                200: signUpResponseSchema,
            },
        },
    },
    authHandler.signUp
);
```

### ⚙️ Repository Generation
The template provides an automatic repository generator based on the Prisma Schema data model.
It includes a set of commonly used CRUD operations for any entity.

The generator is located in `src/database/repositories/generate.repository.ts`.

```typescript
const userRepository = generateRepository(prismaClient, "User");

const user = await userRepository.create({
    data: {},
    select: {},
});

// Methods available: create, update, delete, etc.
await userRepository.delete({
    where: {},
});
```

### ⚙️ ER Diagram Generation
This project automatically generates an **Entity Relationship (ER) diagram** based on your **Prisma schema**.

The generator is located in `src/database/prisma/schema.prisma`.

```typescript
generator dbml {
  provider            = "prisma-dbml-generator"
  output              = "../dbml"
  outputName          = "schema.dbml"
  projectName         = "Project Name"
  projectDatabaseType = "PostgreSQL"
  projectNote         = "ER Diagram"
}
```

To generate ER diagram run command: `npm run prisma:diagram`

After that you'll find `src/database/dbml/schema.dbml`.

To visualize your ER diagram:
1. Open [dbdiagram.io](https://dbdiagram.io/)
2. Paste the contents of schema.dbml into the editor
3. The diagram will be rendered automatically

### 📜 Commits Format

We use Commitlint to ensure that commit messages adhere to the conventional commit format. This standardizes the commit history and simplifies changelog generation.

The basic format is:
```sh
type(scope?): subject
```

Examples:
- `chore: update dependencies`
- `fix(message): correct API response error`
- `feat(auth): add JWT authentication`

A more detailed description you can see in [Conventional Commits documentation](https://www.conventionalcommits.org/en/v1.0.0/#examples).

## 📁 Project Structure
The project is organized into several parts to promote a modular design and separation of concerns:

#### `src/database`:  
This directory manages everything related to data persistence and interaction with the database.  
- The `prisma` subfolder houses the Prisma schema (`schema.prisma`) and migration files that define the application's data model to the database.  
- The `repositories` subfolder contains repository modules for each entity. These repositories provide a unified API for CRUD operations (e.g., in `generate.repository.ts`) and custom logic for data access (e.g., `booking.repository.ts` for the Booking model).

#### `src/modules`:  
This directory contains feature-based modules which encapsulate business logic along with the HTTP layer.  
Each module includes:  
- **Routes**: Define endpoint paths and attach them to the appropriate handlers (e.g., `bookings.route.ts`).  
- **Handlers**: Manage request processing and response formatting by invoking corresponding services (e.g., `bookings.handler.ts`).  
- **Services**: Implement business logic, coordinate with repositories, and use the necessary third-party libraries from `src/lib` (e.g., `bookings.service.ts`).

#### `src/plugins`:  
The directory is dedicated to Fastify plugins which extend the server capabilities. Each file registers a plugin that adds functionality to the Fastify instance.  
Plugins included:  
- **Environment Configuration** (`env.ts`): Loads and validates environment variables.  
- **Database Management** (`prisma.ts`): Sets up a `PrismaClient` and manages database connection.  
- **Authentication** (`jwt.ts`): Configures JSON Web Token handling for security.  
- **API Documentation** (`swagger.ts` and `zod.ts`): Integrates Swagger for API documentation and Zod for schema validation.  
- **Dependency Injection** (`awilix.ts`): Registers and manages service dependencies using Awilix.  
- **Error Handling** (`error.ts`): Provides a centralized mechanism for managing application errors.

#### `src/lib`:  
  This directory serves as an abstraction layer for third-party services and integrations: here the LiteAPI client (`liteapi/`), the Vertex AI client (`ai/`), the request throttle, the TTL cache and the `dayjs` setup (`dates/`).  
  These abstraction layers are registered in the Awilix container and imported by services as needed. Additionally, this folder includes validation schemas using Zod for different modules, as well as utility functions and helpers that support the overall application infrastructure.

#### `src/types`:  
  Global TypeScript types and declarations used across the project.

#### `test`:
This directory contains all test files organized to mirror the structure of the source code.
- The `unit` subdirectory contains unit tests that verify the functionality of individual components in isolation.
  - Tests for library components are in the `lib` subdirectory, ensuring third-party integrations work as expected.
  - Tests for application modules are in the `modules` subdirectory, organized by feature to test services.
- The `int` subdirectory contains integration tests that verify the behavior of multiple components working together within a runtime environment (e.g., service logic interacting with the database or external APIs).
  - Tests are organized by module to mirror the application structure.
  - The `setup` folder provides shared utilities like database migrations initialization and teardown logic.
- Each test file follows the naming convention of `[component-name].test.ts` to clearly identify what's being tested.

#### Project Tree:
```
.
├── commitlint.config.js
├── docker-compose.yml
├── Dockerfile
├── eslint.config.mjs
├── nodemon.json
├── package.json
├── package-lock.json
├── README.md
├── src
│   ├── database
│   │   ├── prisma
│   │   │   ├── migrations
│   │   │   │   └── ...
│   │   │   ├── prisma.type.ts
│   │   │   └── schema.prisma
│   │   └── repositories
│   │       ├── generate.repository.ts
│   │       └── ...
│   ├── lib
│   │   ├── ...
│   │   └── validation
│   │       └── feature
│   │           ├── index.ts
│   │           └── feature.schema.ts
│   ├── modules
│   │   ├── application.ts
│   │   └── feature
│   │       ├── index.ts
│   │       ├── feature.handler.ts
│   │       ├── feature.route.ts
│   │       └── feature.service.ts
│   ├── plugins
│   │   ├── awilix.ts
│   │   ├── cors.ts
│   │   ├── env.ts
│   │   ├── error.ts
│   │   ├── jwt.ts
│   │   ├── prisma.ts
│   │   ├── swagger.ts
│   │   └── zod.ts
│   ├── types
│   │   ├── env.type.ts
│   │   └── index.d.ts
│   ├── index.ts
│   └── server.ts
├── test
│   ├── int
│   │   ├── modules
│   │   │   └── ...
│   │   └── setup
│   └── unit
│       ├── lib
│       │   └── ...
│       └── modules
│           └── feature
│               ├── feature-service.test.ts
│               └── ...
└── tsconfig.json
```

## ✨ Inspired by
- [Fastify example](https://github.com/delvedor/fastify-example) - a brief example of core Fastify features;
- [Guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) - encapsulation and decorators in Fastify.
