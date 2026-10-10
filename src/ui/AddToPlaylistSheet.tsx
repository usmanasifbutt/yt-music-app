import { useState } from 'react';
import { ScrollView, ToastAndroid } from 'react-native';
import { addToPlaylist, createPlaylist, playlistsStore } from '../playlists';
import { useStore } from '../store';
import { NameDialog, Sheet, SheetItem } from './Sheet';

function toast(message: string) {
  ToastAndroid.show(message, ToastAndroid.SHORT);
}

/** Lets the user pick (or create) a playlist for `keys`. Visible while `keys` is non-null. */
export function AddToPlaylistSheet({ keys, onClose }: { keys: string[] | null; onClose: () => void }) {
  const playlists = useStore(playlistsStore);
  const [naming, setNaming] = useState(false);
  const count = keys?.length ?? 0;
  const what = count === 1 ? '1 item' : `${count} items`;

  return (
    <>
      <Sheet visible={!!keys && !naming} title="Add to playlist" subtitle={what} onClose={onClose}>
        <SheetItem icon="+" label="New playlist" onPress={() => setNaming(true)} />
        <ScrollView>
          {playlists.map((p) => (
            <SheetItem
              key={p.id}
              icon="≡"
              label={p.name}
              detail={`${p.keys.length}`}
              onPress={() => {
                const added = addToPlaylist(p.id, keys ?? []);
                toast(added ? `Added ${added} to ${p.name}` : `Already in ${p.name}`);
                onClose();
              }}
            />
          ))}
        </ScrollView>
      </Sheet>
      <NameDialog
        visible={!!keys && naming}
        title="New playlist"
        confirmLabel="Create"
        onCancel={() => setNaming(false)}
        onConfirm={(name) => {
          createPlaylist(name, keys ?? []);
          toast(`Created ${name}`);
          setNaming(false);
          onClose();
        }}
      />
    </>
  );
}
