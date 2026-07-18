/**
 * App Detail Screen
 * Shows information about a specific dApp with an "Install" / "Open" action.
 */
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import {
  Column,
  HeaderBar,
  Row,
  ScreenLayout,
  Text,
  Button,
} from '../components';
import { borderRadius, colors, spacing, typography } from '../theme';

const AppDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const { app } = route.params || {};

  if (!app) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <HeaderBar onBackPress={() => navigation.goBack()} />
        <ScreenLayout centerContent>
          <Text style={{ color: colors.text_secondary }}>App information not found.</Text>
        </ScreenLayout>
      </View>
    );
  }

  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  const handleInstall = () => {
    // Mock install behavior
    console.log('Installing:', app.name);
  };

  const submitReview = () => {
    console.log('Submitted Review:', { rating: userRating, text: reviewText });
    setRatingModalVisible(false);
    setUserRating(0);
    setReviewText('');
  };

  const RatingStars = ({ rating, size = 20, onSelect }: { rating: number, size?: number, onSelect?: (r: number) => void }) => (
    <Row gap="xs">
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onSelect?.(star)}
          disabled={!onSelect}
        >
          <Text style={{ fontSize: size, color: star <= rating ? colors.primary : colors.text_tertiary }}>
            ★
          </Text>
        </TouchableOpacity>
      ))}
    </Row>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenLayout paddingTop={spacing.lg}>
          {/* Header Section: Icon, Name, Category */}
          <Row gap="lg" align="center" style={styles.header}>
            <View style={styles.appIconLarge}>
              <Text style={styles.appIconTextLarge}>{app.name ? app.name.charAt(0) : '?'}</Text>
            </View>
            <Column gap="xs" style={{ flex: 1 }}>
              <Text variant="h2" style={styles.appName}>
                {app.name}
              </Text>
              <Text style={styles.developerName}>{app.developer}</Text>
              <Text style={styles.categoryName}>{app.category}</Text>
            </Column>
            <TouchableOpacity
              style={styles.rateButton}
              onPress={() => setRatingModalVisible(true)}
            >
              <Text style={styles.rateButtonText}>Rate</Text>
            </TouchableOpacity>
          </Row>

          {/* Stats Row: Rating, Downloads, Size */}
          <Row justify="space-around" style={styles.statsRow}>
            <Column align="center">
              <Text style={styles.statValue}>{app.rating} ★</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </Column>
            <View style={styles.statDivider} />
            <Column align="center">
              <Text style={styles.statValue}>{app.downloads}</Text>
              <Text style={styles.statLabel}>Downloads</Text>
            </Column>
            <View style={styles.statDivider} />
            <Column align="center">
              <Text style={styles.statValue}>12 MB</Text>
              <Text style={styles.statLabel}>Size</Text>
            </Column>
          </Row>

          {/* Screenshots Section */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.screenshotsContainer}
            contentContainerStyle={styles.screenshotsContent}
          >
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={styles.screenshotPlaceholder}>
                <Text style={styles.screenshotText}>Preview {i}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Action Button */}
          <Button
            variant="primary"
            onPress={handleInstall}
            style={styles.installButton}
          >
            Install
          </Button>

          {/* Description */}
          <Column gap="sm" style={styles.descriptionSection}>
            <Text variant="h3" style={styles.sectionTitle}>
              About this app
            </Text>
            <Text style={styles.longDescription}>{app.longDesc}</Text>
          </Column>

          {/* Version History (Placeholder) */}
          <Column gap="sm" style={styles.versionSection}>
            <Text variant="h3" style={styles.sectionTitle}>
              What's New
            </Text>
            <Text style={styles.versionNumber}>Version 1.2.4</Text>
            <Text style={styles.versionChanges}>
              • Improved connection stability over QUIC{'\n'}
              • New dark theme assets{'\n'}
              • Bug fixes and performance improvements
            </Text>
          </Column>

          {/* Reviews Section */}
          <Column gap="md" style={styles.reviewsSection}>
            <Row justify="space-between" align="center">
              <Text variant="h3" style={styles.sectionTitle}>
                Reviews
              </Text>
              <Row gap="xs" align="center">
                <Text style={styles.overallRating}>{app.rating}</Text>
                <RatingStars rating={Math.floor(app.rating)} size={14} />
              </Row>
            </Row>

            {[
              { id: 1, user: 'sov_user_42', rating: 5, text: 'Cleanest interface in the network. Fast sync!', date: '2d ago' },
              { id: 2, user: 'zhtp_node_runner', rating: 4, text: 'Good but needs better landscape support.', date: '1w ago' },
            ].map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <Row justify="space-between" align="center" style={{ marginBottom: 4 }}>
                  <Text style={styles.reviewUser}>{review.user}</Text>
                  <Text style={styles.reviewDate}>{review.date}</Text>
                </Row>
                <RatingStars rating={review.rating} size={12} />
                <Text style={styles.reviewText}>{review.text}</Text>
              </View>
            ))}
          </Column>
        </ScreenLayout>
      </ScrollView>

      {/* Rating Modal */}
      <Modal
        visible={ratingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rate {app.name}</Text>
            <View style={{ marginVertical: spacing.md }}>
              <RatingStars rating={userRating} size={32} onSelect={setUserRating} />
            </View>
            <TextInput
              placeholder="Tell us what you think (optional)..."
              placeholderTextColor={colors.text_tertiary}
              style={styles.reviewInput}
              multiline
              value={reviewText}
              onChangeText={setReviewText}
            />
            <Row gap="md" style={{ marginTop: spacing.lg }}>
              <Button
                variant="secondary"
                onPress={() => setRatingModalVisible(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={submitReview}
                style={{ flex: 1 }}
                disabled={userRating === 0}
              >
                Submit
              </Button>
            </Row>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
  },
  appIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: colors.bg_medium,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIconTextLarge: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.primary,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text_primary,
  },
  developerName: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  rateButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  rateButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryName: {
    color: colors.text_secondary,
    fontSize: 14,
  },
  statsRow: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    opacity: 0.8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text_primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text_tertiary,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  screenshotsContainer: {
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.xl,
  },
  screenshotsContent: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  screenshotPlaceholder: {
    width: 180,
    height: 320,
    borderRadius: 12,
    backgroundColor: colors.bg_darker,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenshotText: {
    color: colors.text_tertiary,
    fontSize: 12,
  },
  installButton: {
    height: 48,
    borderRadius: 24,
    marginBottom: spacing.xl,
  },
  descriptionSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text_primary,
    marginBottom: spacing.xs,
  },
  longDescription: {
    fontSize: 14,
    color: colors.text_secondary,
    lineHeight: 20,
  },
  versionSection: {
    marginBottom: spacing['3xl'],
  },
  versionNumber: {
    fontSize: 14,
    color: colors.text_primary,
    fontWeight: '600',
  },
  versionChanges: {
    fontSize: 14,
    color: colors.text_secondary,
    lineHeight: 20,
  },
  reviewsSection: {
    marginBottom: spacing['3xl'],
  },
  overallRating: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text_primary,
  },
  reviewCard: {
    padding: spacing.md,
    backgroundColor: colors.bg_darker,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewUser: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text_primary,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.text_tertiary,
  },
  reviewText: {
    fontSize: 14,
    color: colors.text_secondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.bg_dark,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text_primary,
    textAlign: 'center',
  },
  reviewInput: {
    backgroundColor: colors.bg_darkest,
    borderRadius: 12,
    padding: spacing.md,
    color: colors.text_primary,
    height: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default AppDetailScreen;
