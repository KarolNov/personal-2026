/** Work history, shown on the About page and the printable resume (/resume/). */
export interface Role {
  title: string;
  when: string;
  project: string;
  points: string[];
  stack: string[];
}

export const roles: Role[] = [
  {
    title: 'Principal Software Engineer',
    when: '2025 – now',
    project: 'Ceros Flex',
    points: [
      'Led the move of our sync engine from two-way syncing to an intent-based operations pipeline: every change is validated, normalised and auto-fixed before it lands, so documents stay consistent across collaborators, offline edits and version history.',
      'Helped shape how the DOM tree lives in the CRDT, with fractional indexing so concurrent moves stay conflict-free and cheap to observe on the client.',
      'Built a way for customers to bring content made in Flex into their own sites and apps without relying on iframes.',
      'Worked on performance across the stack — for example, a few recent changes made our server-side and static rendering around 30% faster.',
    ],
    stack: ['Next.js', 'Y.js', 'WebSockets', 'NestJS', 'PostgreSQL', 'Terraform'],
  },
  {
    title: 'Lead Software Engineer',
    when: '2024 – 2025',
    project: 'Ceros Flex',
    points: [
      'Led a team of up to eight senior engineers rebuilding Ceros Studio — a client-heavy visual editor in the same family as Figma or Framer — and helped my reports grow into staff and lead roles.',
      'Set the frontend architecture: real-time collaboration with offline and version history (Y.js), an extensible visual HTML editor built on Web Components, and a DSL that can be edited both visually and as code, which made adding AI collaborators straightforward.',
      'Was part of a cross-team effort with QE and DevOps on our end-to-end pipeline: around 10,000 Playwright tests on custom AWS runners in 6–8 minutes on every PR.',
      'Helped reshape our engineering culture at Ceros, balancing quality, security and speed of delivery in the age of AI-assisted development.',
    ],
    stack: ['Lit / Web Components', 'Turborepo', 'Vite', 'Vitest', 'Playwright'],
  },
  {
    title: 'Senior Staff Software Engineer',
    when: '2024',
    project: 'AI assistant',
    points: [
      'Built an AI assistant that worked across Ceros products, with ideas that were early at the time: a voice-to-voice mode before realtime APIs were common, artifact-style outputs, and a visual guide that let vision models point at exact spots on an image.',
      'The project was sunset after a change in leadership and strategy, but what we learned building it carried into AI features across Ceros products.',
    ],
    stack: ['React', 'Python', 'FastAPI', 'LangChain', 'Temporal', 'Pinecone'],
  },
  {
    title: 'Senior, then Lead Software Engineer',
    when: '2020 – 2024',
    project: 'MarkUp.io',
    points: [
      'Joined early and spent four years on a product for commenting directly on live websites — which meant learning the limits of the web the hard way: proxying and shimming third-party sites into iframes, pins that stick to elements, and a Chrome extension for pages that refuse to be embedded.',
      'Built a native screenshot pipeline (snapshot, rebuild, headless browser) that beat any HTML-to-image library on consistency, and helped architect instant and digest notifications for email, Slack and Teams.',
      'Learned to build from customer evidence: analytics, customer learning sessions and a Slack community where you see the effect of a fix the same day.',
    ],
    stack: ['React', 'Express', 'BullMQ', 'AWS SQS', 'DynamoDB', 'Chrome extension'],
  },
];

