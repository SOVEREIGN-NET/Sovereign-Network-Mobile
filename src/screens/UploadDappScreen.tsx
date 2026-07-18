import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Image,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import {
  HeaderBar,
  Text,
  Column,
  Row,
  ScreenLayout,
  Card,
  Button,
} from '../components';
import { colors, spacing, typography, borderRadius, shadows } from '../theme/tokens';

const UploadDappScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  // Form State
  const [appName, setAppName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priceSov, setPriceSov] = useState('0');
  const [apkFile, setApkFile] = useState<string | null>(null);
  const [sovDomain, setSovDomain] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAndroid = Platform.OS === 'android';

  const handleSelectApk = () => {
    // Mock file picker
    Alert.alert('File Picker', 'APK file selector would open here.');
    setApkFile('myapp-v1.0.apk');
  };

  const handleAddScreenshot = () => {
    // Mock image picker
    Alert.alert('Image Picker', 'Screenshot selector would open here.');
    if (screenshots.length < 5) {
      setScreenshots([...screenshots, 'placeholder']);
    }
  };

  const handleSubmit = () => {
    if (isAndroid) {
      if (!appName || !description || !apkFile) {
        Alert.alert('Missing Info', 'Please provide an app name, description, and APK file.');
        return;
      }
    } else {
      if (!appName || !description || !sovDomain) {
        Alert.alert('Missing Info', 'Please provide an app name, description, and .sov domain link.');
        return;
      }
    }

    setIsSubmitting(true);

    // Simulate upload
    setTimeout(() => {
      setIsSubmitting(false);
      Alert.alert(
        'Submission Received',
        'Your dApp has been submitted for review. Our team will check for malicious content and security vulnerabilities before it appears in the store.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }, 2000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
      <HeaderBar
        onBackPress={() => navigation.goBack()}
        showHamburger={false}
      />

      <ScreenLayout paddingTop={spacing.md}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Column gap="lg" style={{ paddingBottom: spacing.xxxl }}>
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Text variant="h2" style={{ marginBottom: spacing.xs }}>Publish to Store</Text>
              <Text style={{ color: colors.text_secondary, fontSize: 14 }}>
                {isAndroid
                  ? 'Reach the Sovereign community by publishing your Android app.'
                  : 'Link your .sov domain to enable users to save your dApp to their iOS home screen.'}
              </Text>
            </View>

            <Card style={styles.reviewCard}>
              <Row gap="sm">
                <Text style={{ fontSize: 20 }}>🛡️</Text>
                <Column style={{ flex: 1 }}>
                  <Text style={styles.reviewTitle}>Security Review Required</Text>
                  <Text style={styles.reviewText}>
                    {isAndroid
                      ? 'All submissions are manually reviewed to ensure they are safe, non-malicious, and respect user privacy.'
                      : 'We verify that your .sov domain serves a valid Progressive Web App (PWA) that is safe for the community.'}
                  </Text>
                </Column>
              </Row>
            </Card>

            <Column gap="md">
              {isAndroid ? (
                <FormSection title="APK File">
                  <TouchableOpacity
                    style={styles.uploadBox}
                    onPress={handleSelectApk}
                  >
                    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                      <Path d="M12 15V3m0 0l-3 3m3-3l3 3M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" stroke={colors.primary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                    <Text style={styles.uploadLabel}>
                      {apkFile ? apkFile : 'Select .apk file'}
                    </Text>
                    <Text style={styles.uploadSublabel}>Max size: 100MB • Free to upload</Text>
                  </TouchableOpacity>
                </FormSection>
              ) : (
                <FormSection title="Web dApp (.sov domain)">
                  <TextInput
                    placeholder="your-app.sov"
                    placeholderTextColor={colors.text_placeholder}
                    style={styles.input}
                    value={sovDomain}
                    onChangeText={setSovDomain}
                    autoCapitalize="none"
                  />
                  <Text style={styles.priceNote}>Users will be prompted to "Add to Home Screen" to install your dApp.</Text>
                </FormSection>
              )}

              <FormSection title="App Details">
                <TextInput
                  placeholder="App Name"
                  placeholderTextColor={colors.text_placeholder}
                  style={styles.input}
                  value={appName}
                  onChangeText={setAppName}
                />
                <TextInput
                  placeholder="Category (e.g. Finance, Social, Tools)"
                  placeholderTextColor={colors.text_placeholder}
                  style={styles.input}
                  value={category}
                  onChangeText={setCategory}
                />
                <TextInput
                  placeholder="Description"
                  placeholderTextColor={colors.text_placeholder}
                  style={[styles.input, styles.textArea]}
                  multiline
                  numberOfLines={4}
                  value={description}
                  onChangeText={setDescription}
                />
              </FormSection>

              <FormSection title="Store Pricing">
                <Row align="center" gap="md">
                  <View style={{ flex: 1 }}>
                    <TextInput
                      placeholder="Price"
                      placeholderTextColor={colors.text_placeholder}
                      style={styles.input}
                      keyboardType="numeric"
                      value={priceSov}
                      onChangeText={setPriceSov}
                    />
                  </View>
                  <Text style={{ color: colors.primary, fontWeight: 'bold' }}>$SOV</Text>
                </Row>
                <Text style={styles.priceNote}>Set to 0 for free apps. You receive 100% of the sale price.</Text>
              </FormSection>

              <FormSection title="Screenshots (Max 5)">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Row gap="sm">
                    {screenshots.map((_, index) => (
                      <View key={index} style={styles.screenshotPlaceholder}>
                        <Text style={{ color: colors.text_tertiary, fontSize: 10 }}>Screenshot {index + 1}</Text>
                      </View>
                    ))}
                    {screenshots.length < 5 && (
                      <TouchableOpacity
                        style={[styles.screenshotPlaceholder, styles.addScreenshot]}
                        onPress={handleAddScreenshot}
                      >
                        <Text style={{ color: colors.primary, fontSize: 24 }}>+</Text>
                      </TouchableOpacity>
                    )}
                  </Row>
                </ScrollView>
              </FormSection>
            </Column>

            <Button
              onPress={handleSubmit}
              loading={isSubmitting}
              style={{ marginHorizontal: spacing.sm, marginTop: spacing.lg }}
            >
              Submit for Review
            </Button>

            <Text style={styles.footerNote}>
              By submitting, you agree to the Sovereign Developer Terms.
            </Text>
          </Column>
        </ScrollView>
      </ScreenLayout>
    </View>
  );
};

const FormSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <View style={{ paddingHorizontal: spacing.sm }}>
    <Text style={styles.sectionLabel}>{title}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  reviewCard: {
    marginHorizontal: spacing.sm,
    backgroundColor: colors.bg_dark,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  reviewTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text_primary,
  },
  reviewText: {
    fontSize: 12,
    color: colors.text_secondary,
    lineHeight: 18,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text_tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  uploadBox: {
    height: 120,
    backgroundColor: colors.bg_darker,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  uploadLabel: {
    fontSize: 14,
    color: colors.text_primary,
    fontWeight: '600',
  },
  uploadSublabel: {
    fontSize: 10,
    color: colors.text_tertiary,
  },
  input: {
    backgroundColor: colors.bg_darker,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text_primary,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  priceNote: {
    fontSize: 11,
    color: colors.text_tertiary,
    fontStyle: 'italic',
  },
  screenshotPlaceholder: {
    width: 100,
    height: 180,
    backgroundColor: colors.bg_darker,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addScreenshot: {
    borderStyle: 'dashed',
  },
  footerNote: {
    fontSize: 11,
    color: colors.text_tertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

export default UploadDappScreen;
