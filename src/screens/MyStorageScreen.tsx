import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  TextInput,
} from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import {
  HeaderBar,
  Text,
  Column,
  Row,
  ScreenLayout,
  Card,
  Input,
} from '../components';
import { useAuth } from '../hooks';
import { colors, spacing, typography, borderRadius, shadows } from '../theme/tokens';

interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: string;
  modified: string;
  mimeType?: string;
}

const MOCK_DATA: FileItem[] = [];

const FolderIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      stroke={color}
      strokeWidth={1.5}
      fill={color + '20'}
    />
  </Svg>
);

const FileIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"
      stroke={color}
      strokeWidth={1.5}
    />
    <Path d="M13 2v7h7" stroke={color} strokeWidth={1.5} />
  </Svg>
);

const PlusIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
  </Svg>
);

const MyStorageScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { currentIdentity } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const isPremium = currentIdentity?.tier === 'premium';
  const totalStorage = isPremium ? 25 : 10;

  const filteredData = MOCK_DATA.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUpload = () => {
    Alert.alert('Upload', 'Storage upload selector would open here.');
  };

  const renderItem = ({ item }: { item: FileItem }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => item.type === 'folder' ? Alert.alert('Folder', `Opening ${item.name}`) : Alert.alert('File', `Downloading ${item.name}`)}
      style={styles.fileRow}
    >
      <Row align="center" gap="md">
        <View style={styles.iconWrapper}>
          {item.type === 'folder' ? <FolderIcon color={colors.primary} /> : <FileIcon color={colors.text_secondary} />}
        </View>
        <Column style={{ flex: 1 }}>
          <Text style={styles.fileName}>{item.name}</Text>
          <Text style={styles.fileMeta}>
            {item.type === 'file' ? `${item.size} • ` : ''}{item.modified}
          </Text>
        </Column>
        <TouchableOpacity onPress={() => Alert.alert('Options', 'File options menu')}>
          <Text style={{ color: colors.text_tertiary, fontSize: 20 }}>⋮</Text>
        </TouchableOpacity>
      </Row>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar onBackPress={() => navigation.goBack()} showHamburger={false} />

      <ScreenLayout paddingTop={spacing.md}>
        <Column gap="lg" style={{ flex: 1 }}>
          {/* Header & Search */}
          <View style={{ paddingHorizontal: spacing.sm }}>
            <Row align="center" justify="space-between" style={{ marginBottom: spacing.md }}>
              <View>
                <Text variant="h2">My Drive</Text>
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: 'bold', marginTop: 2 }}>
                  {isPremium ? 'PREMIUM STORAGE' : 'FREE TIER'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  {viewMode === 'list' ? (
                    <Path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" stroke={colors.text_secondary} strokeWidth={2} />
                  ) : (
                    <Path d="M3 6h18M3 12h18M3 18h18" stroke={colors.text_secondary} strokeWidth={2} strokeLinecap="round" />
                  )}
                </Svg>
              </TouchableOpacity>
            </Row>

            <View style={styles.searchBar}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" style={{ marginRight: spacing.sm }}>
                <Circle cx="11" cy="11" r="8" stroke={colors.text_tertiary} strokeWidth={2} />
                <Path d="M21 21l-4.35-4.35" stroke={colors.text_tertiary} strokeWidth={2} strokeLinecap="round" />
              </Svg>
              <TextInput
                placeholder="Search files and folders"
                placeholderTextColor={colors.text_placeholder}
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Storage Usage Card */}
          <Card style={styles.usageCard}>
            <Column gap="sm">
              <Row justify="space-between" align="center">
                <Text style={styles.usageTitle}>Network Storage</Text>
                <Text style={styles.usagePercent}>0% used</Text>
              </Row>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '0%' }]} />
              </View>
              <Text style={styles.usageText}>0 GB of {totalStorage} GB used</Text>
            </Column>
          </Card>

          {/* Files List */}
          <FlatList
            data={filteredData}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={{ color: colors.text_tertiary }}>No files found</Text>
              </View>
            }
          />
        </Column>
      </ScreenLayout>

      {/* Upload FAB */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleUpload}
        style={[styles.fab, { bottom: spacing.xl + 20 }]}
      >
        <PlusIcon color={colors.bg_darkest} />
        <Text style={styles.fabText}>Upload</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_dark,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text_primary,
    fontSize: 15,
  },
  usageCard: {
    marginHorizontal: spacing.sm,
    backgroundColor: colors.bg_darker,
    padding: spacing.md,
  },
  usageTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text_secondary,
    textTransform: 'uppercase',
  },
  usagePercent: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.bg_dark,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  usageText: {
    fontSize: 11,
    color: colors.text_tertiary,
  },
  fileRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '20',
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.bg_dark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text_primary,
  },
  fileMeta: {
    fontSize: 12,
    color: colors.text_tertiary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 30,
    ...shadows.lg,
    gap: spacing.sm,
  },
  fabText: {
    color: colors.bg_darkest,
    fontWeight: '700',
    fontSize: 14,
  },
});

export default MyStorageScreen;
