import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, font } from '../theme';
import { Icon } from './Icon';
import { resolveEvidence } from '../lib/evidenceStore';

/**
 * Turn a stored evidence entry into a displayable URI.
 *
 * Entries are keys that may not be on this phone yet, so the first view of an
 * attachment recorded elsewhere downloads it. `null` while fetching, and it
 * stays null if the image cannot be had — the caller shows a placeholder
 * rather than a broken tile.
 */
function useResolvedEvidence(entry: string): { uri: string | null; loading: boolean } {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    resolveEvidence(entry)
      .then((r) => {
        if (!alive) return;
        setUri(r);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setUri(null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [entry]);

  return { uri, loading };
}

/** One thumbnail, responsible for fetching its own image. */
function EvidenceThumb({
  entry,
  size,
  onOpen,
  onRemove,
}: {
  entry: string;
  size: number;
  onOpen: (uri: string) => void;
  onRemove?: (entry: string) => void;
}) {
  const { uri, loading } = useResolvedEvidence(entry);
  const box = { width: size, height: size, borderRadius: 12, backgroundColor: colors.track } as const;

  return (
    <View>
      <Pressable
        onPress={() => uri && onOpen(uri)}
        disabled={!uri}
        accessibilityLabel={uri ? 'View evidence image' : 'Evidence image unavailable'}
      >
        {uri ? (
          <Image source={{ uri }} style={box} />
        ) : (
          <View style={[box, s.placeholder]}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.faint} />
            ) : (
              <Icon name="cloud-off" size={Math.round(size / 3.2)} color={colors.faint} />
            )}
          </View>
        )}
      </Pressable>
      {onRemove && (
        <Pressable accessibilityLabel="Remove image" onPress={() => onRemove(entry)} style={s.removeBtn}>
          <Icon name="close" size={13} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

/** Horizontal strip of evidence thumbnails; tap opens a full-screen viewer. */
export function EvidenceThumbs({
  uris,
  size = 64,
  onRemove,
}: {
  uris: string[];
  size?: number;
  onRemove?: (uri: string) => void;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  if (uris.length === 0) return null;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {uris.map((entry) => (
          <EvidenceThumb
            key={entry}
            entry={entry}
            size={size}
            onOpen={setViewing}
            onRemove={onRemove}
          />
        ))}
      </ScrollView>
      <ImageViewer uri={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

/** Full-screen dark viewer for a single evidence image. */
export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.viewerRoot}>
        {uri && <Image source={{ uri }} style={{ width, height: height * 0.82 }} resizeMode="contain" />}
        <Pressable onPress={onClose} style={s.viewerClose} accessibilityLabel="Close image">
          <Icon name="close" size={22} color="#fff" />
          <Text style={s.viewerCloseText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(10,15,12,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  viewerCloseText: { color: '#fff', fontFamily: font.bodyBold, fontSize: 14 },
});
