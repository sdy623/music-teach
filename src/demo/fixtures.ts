export interface DemoFixture {
  id: string;
  label: string;
  path: string;
  tags?: string[];
}

export const demoFixtures: DemoFixture[] = [
  {
    id: "sakura",
    label: "さくら (folk song)",
    path: "/fixtures/sakura.jpwabc",
    tags: ["FOLK", "JAPANESE"]
  },
  {
    id: "notation-reference",
    label: "Notation reference",
    path: "/fixtures/notation-reference.jpwabc",
    tags: ["REFERENCE"]
  },
  {
    id: "im-eul-wihan-haengjingok",
    label: "임을 위한 행진곡（韩语占位）",
    path: "/fixtures/im-eul-wihan-haengjingok-placeholder.jpwabc",
    tags: ["KOREAN", "GWANGJU", "PLACEHOLDER"]
  },
  {
    id: "rhythm-x",
    label: "Rhythm X",
    path: "/fixtures/rhythm-x.jpwabc",
    tags: ["RHYTHM"]
  }
];

export function findFixture(id: string): DemoFixture {
  return demoFixtures.find((fixture) => fixture.id === id) ?? demoFixtures[0]!;
}
