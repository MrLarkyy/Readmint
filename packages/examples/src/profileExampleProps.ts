import { profileLogos, type ProfileLogo } from "./profileLogos.js";

const layerSlots = 4;

const padded = (pick: (logo: ProfileLogo, layer: number) => string): string[] =>
  profileLogos.flatMap((logo) =>
    Array.from({ length: layerSlots }, (_, layer) => pick(logo, layer)),
  );

/** The colour logos as the flat, stride-4 props of the year-ring and pinscreen templates (see their README). */
const logoLayerProps: Readonly<Record<string, ExampleProp>> = {
  logoLayers: padded((logo, layer) => logo.layers[layer]?.d ?? ""),
  logoFills: padded((logo, layer) => logo.layers[layer]?.fill ?? ""),
  logoFillsDark: padded((logo, layer) => logo.layers[layer]?.fillDark ?? ""),
  logoWithName: profileLogos.map((logo) => (logo.withName ? "1" : "")),
};

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
        "Backend engineer working in Kotlin and Java on the JVM, currently at we.builders. I build scalable services, APIs, messaging systems and internal tooling.",
    },
    index: {
      labels: ["Focus", "Systems", "Frameworks", "Data", "Tools", "Shipped for"],
      values: [
        "Backend services, APIs and internal tooling",
        "Messaging with Redis, RabbitMQ and NATS; Netty, Kotlin Coroutines",
        "Ktor, Spring Boot, Exposed",
        "PostgreSQL, MySQL, MariaDB, SQLite, Amazon S3, Protocol Buffers",
        "IntelliJ IDEA, Rider, WebStorm, Gradle, JUnit, MockK",
        "we.builders, SWN Moravia, Partners, Hoplite, Minebox, Cobblemon Islands, Mineclub",
      ],
      languagesAfter: 2,
      languageShare: "repositories",
      logoLabels: ["Working now", "Before", "", ""],
      logoLines: profileLogos.map((logo) => String(logo.line)),
      logoNames: profileLogos.map((logo) => logo.name),
      ...logoLayerProps,
      logosRow: 5,
    },
    footer: {
      headline: "Open to long-term collaborations.",
      note: "Backend-heavy projects, tooling and infrastructure. Best reached on LinkedIn.",
      contactLabel: "LinkedIn",
      contactText: "linkedin.com/in/tadeas-ganzwohl",
    },
  },
  horizon: {
    header: {
      role: "Backend engineer",
      roleDetail: "Kotlin, Java & the JVM",
      workingOn: "Backend services,",
      workingOnDetail: "messaging & tooling",
      statusNote: "Open to collaborations",
    },
    stack: {
      languageShare: "repositories",
      labels: ["Frameworks", "Messaging", "Data", "Tools"],
      items: [
        "Ktor\nSpring Boot\nExposed\nNetty",
        "Redis\nRabbitMQ\nNATS\nProtobuf",
        "PostgreSQL\nMySQL\nMariaDB\nSQLite",
        "IntelliJ IDEA\nRider\nWebStorm\nGradle",
      ],
    },
    worked: {
      items: [
        "Hoplite",
        "Minebox",
        "Cobblemon Islands",
        "Mineclub",
        "SWN Moravia",
        "we.builders",
        "Partners",
      ],
    },
    footer: {
      headline: "Open to long-term\ncollaborations.",
      note: "Backend-heavy projects,\ntooling and infrastructure.",
      contactLabel: "linkedin",
      contactText: "linkedin.com/in/tadeas-ganzwohl",
    },
  },
  pinscreen: {
    header: {
      role: "Backend engineer. Kotlin, Java and the JVM.",
      intro: "Backend services, APIs and messaging systems, now at we.builders.",
      branch: "main",
      statusBarRight: "Kotlin · LF · UTF-8",
    },
    stack: {
      languageShare: "repositories",
      plugin: 'kotlin("jvm")',
      labels: ["frameworks", "messaging", "storage", "wire format"],
      items: [
        "ktor, spring boot, exposed, netty",
        "redis, rabbitmq, nats",
        "postgresql, mysql, mariadb, sqlite",
        "protobuf",
      ],
      noteLabels: ["tools", "shipped for"],
      noteItems: [
        "IntelliJ IDEA, Rider, WebStorm, Gradle, JUnit, MockK",
        "we.builders, SWN Moravia, Partners, Hoplite, Minebox, Cobblemon Islands, Mineclub",
      ],
      logoLabels: ["working now", "before", "", ""],
      logoLines: profileLogos.map((logo) => String(logo.line)),
      logoNames: profileLogos.map((logo) => logo.name),
      ...logoLayerProps,
      logosRow: 1,
    },
    footer: {
      headline: "Open to long-term collaborations.",
      note: "Backend-heavy projects, tooling and infrastructure.",
      contactLabel: "linkedin",
      contactText: "linkedin.com/in/tadeas-ganzwohl",
    },
  },
};
