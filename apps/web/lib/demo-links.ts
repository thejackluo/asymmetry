// Links / About / Credits shown on /demo. Keep in sync with docs/DEMO.md.

export interface DemoLink {
  label: string;
  href: string;
}

export interface DemoLinkGroup {
  title: string;
  links: DemoLink[];
}

export const DEMO_LINK_GROUPS: DemoLinkGroup[] = [
  {
    title: 'Project',
    links: [
      { label: 'Asymmetry repo', href: 'https://github.com/thejackluo/asymmetry' },
      { label: 'Asymmetry demo video', href: 'https://www.youtube.com/watch?v=7YhwRBV33PU' },
      {
        label: 'HackerHouse project page',
        href: 'https://www.gthackerhouse.com/events/devin-hackathon/projects/481d499f-9e34-4b73-8805-a96aa4eea89d',
      },
      {
        label: 'Devin session (as listed on HackerHouse)',
        href: 'https://app.devin.ai/sessions/3f6ed8da12944a3294f4ed4deb971c95',
      },
    ],
  },
  {
    title: 'LinkedIn',
    links: [
      {
        label: 'Shared post',
        href: 'https://www.linkedin.com/feed/update/urn:li:activity:7520388543140143104/',
      },
      {
        label: 'Original post by Bayzhan',
        href: 'https://www.linkedin.com/posts/bayzhan8_yesterday-we-got-2nd-place-at-the-cognition-ugcPost-7520259507004997632-pvH1/',
      },
      { label: 'Jack', href: 'https://www.linkedin.com/in/thejackluo/' },
      { label: 'Jad (activity)', href: 'https://www.linkedin.com/in/jad-matthew-bardawil/recent-activity/all/' },
      { label: 'Akash (activity)', href: 'https://www.linkedin.com/in/akash-si/recent-activity/all/' },
    ],
  },
  {
    title: 'Community',
    links: [
      {
        label: 'HackerHouse projects',
        href: 'https://www.gthackerhouse.com/events/devin-hackathon/projects',
      },
      { label: 'Event page (Luma)', href: 'https://luma.com/7my0pg5g' },
      { label: 'HackerHouse @ Georgia Tech', href: 'https://gthackerhouse.com/' },
      { label: 'HackerHouse on LinkedIn', href: 'https://www.linkedin.com/company/gt-hackerhouse/' },
      { label: 'HackerHouse on X', href: 'https://x.com/gthackerhouse' },
      { label: 'HackerHouse Campus', href: 'https://hackerhousecampus.com' },
    ],
  },
];

export const DEMO_TEAM: DemoLink[] = [
  { label: 'Jack Luo (@thejackluo)', href: 'https://github.com/thejackluo' },
  { label: 'Bayzhan (@bayzhan8)', href: 'https://github.com/bayzhan8' },
  { label: 'Jad (@jmb245)', href: 'https://github.com/jmb245' },
  { label: 'Akash (@AkashSingirikonda)', href: 'https://github.com/AkashSingirikonda' },
];
