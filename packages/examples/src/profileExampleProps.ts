/** One root prop value of a design: a text, a number, a flag or a list of them. */
export type ExampleProp = string | number | boolean | readonly (string | number | boolean)[];

/**
 * The personal texts of the approved prototype, set as the root props of each section, as a user fills them in, by
 * template folder and section (file name without `.json`). They live only here: the template files have empty
 * defaults and no example value (the no-literal test). The example goldens and the example repository render with
 * them.
 */
export const profileExampleProps: Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, ExampleProp>>>>>
> = {
  "year-ring": {
    header: {
      intro:
        "Backend engineer working in Kotlin and on the JVM. I build clean, scalable services, internal tooling and messaging systems for Minecraft servers and creators.",
    },
    index: {
      labels: ["Focus", "Systems", "Frameworks", "Data", "Tools", "Shipped for", "Creators"],
      values: [
        "Backend systems and internal tooling",
        "Messaging with Redis, RabbitMQ and NATS",
        "Ktor, Spring",
        "PostgreSQL, MySQL, MariaDB, SQLite, Protocol Buffers",
        "IntelliJ IDEA, Rider, WebStorm, Gradle",
        "Hoplite, Minebox, Cobblemon Islands, Mineclub",
        "MrBeast, SpeedSilver, DiamondXR",
      ],
      languagesAfter: 2,
    },
    footer: {
      headline: "Open to long-term collaborations.",
      note: "Backend-heavy projects, tooling and infrastructure. Best reached on Discord.",
      contactLabel: "Discord",
      contactText: "discord.aquatic.gg",
    },
  },
  horizon: {
    header: {
      role: "Backend engineer",
      roleDetail: "Kotlin & the JVM",
      workingOn: "Messaging systems,",
      workingOnDetail: "internal tooling",
      statusNote: "Open to collaborations",
    },
    stack: {
      labels: ["Frameworks", "Messaging", "Data", "Tools"],
      items: [
        "Ktor\nSpring",
        "Redis\nRabbitMQ\nNATS",
        "PostgreSQL\nMySQL\nMariaDB\nSQLite\nProtobuf",
        "IntelliJ IDEA\nRider\nWebStorm\nGradle",
      ],
    },
    worked: {
      items: [
        "Hoplite",
        "Minebox",
        "Cobblemon Islands",
        "Mineclub",
        "MrBeast",
        "SpeedSilver",
        "DiamondXR",
      ],
    },
    footer: {
      headline: "Open to long-term\ncollaborations.",
      note: "Backend-heavy projects,\ntooling and infrastructure.",
      contactLabel: "discord",
      contactText: "discord.aquatic.gg",
    },
  },
  pinscreen: {
    header: {
      role: "Backend engineer. Kotlin, the JVM and messaging systems.",
      intro: "Building internal tooling and services for Minecraft servers and their creators.",
      branch: "main",
      statusBarRight: "Kotlin · LF · UTF-8",
    },
    stack: {
      plugin: 'kotlin("jvm")',
      labels: ["frameworks", "messaging", "storage", "wire format"],
      items: [
        "ktor, spring",
        "redis, rabbitmq, nats",
        "postgresql, mysql, mariadb, sqlite",
        "protobuf",
      ],
      noteLabels: ["tools", "shipped for", "creators"],
      noteItems: [
        "IntelliJ IDEA, Rider, WebStorm, Gradle",
        "Hoplite, Minebox, Cobblemon Islands, Mineclub",
        "MrBeast, SpeedSilver, DiamondXR",
      ],
    },
    footer: {
      headline: "Open to long-term collaborations.",
      note: "Backend-heavy projects, tooling and infrastructure.",
      contactLabel: "reach me",
      contactText: "discord.aquatic.gg",
    },
  },
};
