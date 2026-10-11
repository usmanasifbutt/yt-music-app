import { getSetting, setSetting } from './library';
import { createStore } from './store';
import type { IconName } from './ui/Icon';

export type Interest = {
  id: string;
  label: string;
  icon: IconName;
  /** YouTube searches behind the Home row; one is used per day, rotating for variety. */
  queries: string[];
};

export const INTERESTS: Interest[] = [
  {
    id: 'punjabi',
    label: 'Punjabi',
    icon: 'music-note',
    queries: ['Karan Aujla new song', 'AP Dhillon songs', 'Diljit Dosanjh songs', 'new Punjabi songs'],
  },
  {
    id: 'naat',
    label: 'Naat',
    icon: 'mosque',
    queries: ['Naat Sharif', 'Owais Raza Qadri naat', 'Junaid Jamshed naat', 'Hafiz Tahir Qadri naat'],
  },
  {
    id: 'quran',
    label: 'Quran',
    icon: 'menu-book',
    queries: ['Quran recitation', 'Mishary Rashid Alafasy recitation', 'Yasser Al Dosari recitation', 'Abdul Rahman Al Sudais recitation'],
  },
  {
    id: 'cokestudio',
    label: 'Coke Studio',
    icon: 'mic',
    queries: ['Coke Studio Pakistan latest', 'Coke Studio Pakistan classics', 'Coke Studio Pakistan hits'],
  },
  {
    id: 'lofi',
    label: 'Lo-fi',
    icon: 'headphones',
    queries: ['lofi hip hop', 'Urdu lofi songs', 'Hindi lofi songs'],
  },
  {
    id: 'nasheed',
    label: 'Nasheed',
    icon: 'nights-stay',
    queries: ['Nasheed', 'Maher Zain nasheed', 'Sami Yusuf nasheed', 'Muhammad al Muqit nasheed'],
  },
  {
    id: 'english',
    label: 'English',
    icon: 'public',
    queries: ['top English songs', 'The Weeknd songs', 'Ed Sheeran songs', 'Taylor Swift songs'],
  },
  {
    id: 'bollywood',
    label: 'Bollywood',
    icon: 'movie',
    queries: ['Arijit Singh songs', 'new Bollywood songs', 'Bollywood romantic hits', 'Shreya Ghoshal songs'],
  },
  {
    id: 'pakpop',
    label: 'Pakistani pop',
    icon: 'star',
    queries: ['Atif Aslam songs', 'Ali Zafar songs', 'Hasan Raheem songs', 'new Pakistani songs'],
  },
];

/** null until the user has picked interests (first launch shows the picker). */
export const interestsStore = createStore<string[] | null>(null);

export function loadInterests() {
  interestsStore.set(getSetting<string[] | null>('interests', null));
}

export function saveInterests(ids: string[]) {
  setSetting('interests', ids);
  interestsStore.set(ids);
}

/** Today's search for an interest; rotates daily through its queries. */
export function todaysQuery(interest: Interest) {
  const day = Math.floor(Date.now() / 86_400_000);
  return interest.queries[day % interest.queries.length];
}
