import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, font } from '../theme';
import { Icon } from './Icon';

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
        {uris.map((uri) => (
          <View key={uri}>
            <Pressable onPress={() => setViewing(uri)} accessibilityLabel="View evidence image">
              <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.track }} />
            </Pressable>
            {onRemove && (
              <Pressable accessibilityLabel="Remove image" onPress={() => onRemove(uri)} style={s.removeBtn}>
                <Icon name="close" size={13} color="#fff" />
              </Pressable>
            )}
          </View>
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
