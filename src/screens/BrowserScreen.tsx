import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { Card, Text, Button, Column, Input } from '../components';
import { useTranslation } from '../i18n';
import { colors, spacing } from '../theme';

const mockWebsites: { [key: string]: { title: string; description: string; content: string } } = {
  'zhtp://network.sovereign': {
    title: 'Sovereign Network Hub',
    description: 'Welcome to the ZHTP Web4 Network',
    content:
      'The Sovereign Network is a decentralized internet built on Zero-Knowledge technology. Browse, transact, and govern without intermediaries.',
  },
  'dao://governance': {
    title: 'DAO Governance Portal',
    description: 'Decentralized Autonomous Organization',
    content:
      'Participate in network governance. Vote on proposals, allocate treasury funds, and shape the future of Web4.',
  },
  'mesh://nodes.local': {
    title: 'Local Mesh Network',
    description: 'Your Edge Node Dashboard',
    content:
      'Connected to 42 nodes in your mesh network. Bandwidth: 45 Mbps. Latency: 8ms. Help strengthen the network.',
  },
  'zk://identity.sovereign': {
    title: 'ZK-DID Identity Manager',
    description: 'Zero-Knowledge Digital Identity',
    content:
      'Manage your Zero-Knowledge Decentralized Identity. Prove citizenship without revealing personal information.',
  },
  'web4://chat.sovereign': {
    title: 'Decentralized Chat',
    description: 'Private Messaging Protocol',
    content:
      'Send encrypted messages across the ZHTP network. End-to-end encrypted with zero-knowledge proofs.',
  },
};

const suggestedSites = [
  { url: 'zhtp://network.sovereign', title: 'Network Hub', emoji: '🌐' },
  { url: 'dao://governance', title: 'DAO Portal', emoji: '🏛️' },
  { url: 'mesh://nodes.local', title: 'Mesh Network', emoji: '🔗' },
  { url: 'zk://identity.sovereign', title: 'ZK Identity', emoji: '👤' },
  { url: 'web4://chat.sovereign', title: 'Chat', emoji: '💬' },
];

const BrowserScreen = () => {
  const { t } = useTranslation();
  const [currentUrl, setCurrentUrl] = useState('zhtp://network.sovereign');
  const [urlInput, setUrlInput] = useState('zhtp://network.sovereign');
  const [loading, setLoading] = useState(false);
  const [browserContent, setBrowserContent] = useState(mockWebsites['zhtp://network.sovereign']);

  const handleNavigate = () => {
    setLoading(true);
    setTimeout(() => {
      const normalizedUrl = urlInput.toLowerCase().trim();
      setCurrentUrl(normalizedUrl);
      setBrowserContent(
        mockWebsites[normalizedUrl] || {
          title: t.browser.errors.notFound,
          description: t.browser.errors.notResolved,
          content: t.browser.errors.couldNotResolve.replace('{domain}', normalizedUrl),
        },
      );
      setLoading(false);
    }, 500);
  };

  return (
    <ScrollView
      testID="browser-screen"
      style={{
        flex: 1,
        backgroundColor: colors.bg_dark,
        padding: spacing.lg,
      }}
    >
      {/* Browser Controls */}
      <Card>
        <Text variant="h3">{t.browser.title}</Text>
        <Column gap="md" style={{ marginTop: spacing.md }}>
          <Input
            placeholder={t.browser.urlPlaceholder}
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={handleNavigate}
          />
          <Button onPress={handleNavigate}>{t.browser.navigateButton}</Button>
          <Text variant="caption" style={{ color: colors.success, textAlign: 'center' }}>
            {t.browser.connectionStatus}
          </Text>
        </Column>
      </Card>

      {/* Browser Content */}
      {!loading && browserContent && (
        <Card>
          <Text variant="h2" style={{ color: colors.primary, marginBottom: spacing.sm }}>
            {browserContent.title}
          </Text>
          <Text variant="caption" style={{ color: colors.text_secondary, marginBottom: spacing.md }}>
            {browserContent.description}
          </Text>
          <Text variant="body">{browserContent.content}</Text>
        </Card>
      )}

      {/* Suggested Sites */}
      <Card>
        <Text variant="h3">{t.browser.suggestedSites}</Text>
        <Column gap="sm" style={{ marginTop: spacing.md }}>
          {suggestedSites.map(site => (
            <Button
              key={site.url}
              onPress={() => {
                setUrlInput(site.url);
                setTimeout(() => handleNavigate(), 100);
              }}
              variant="outline"
            >
              <Text>{site.title}</Text>
            </Button>
          ))}
        </Column>
      </Card>

      {/* Browser Features */}
      <Card>
        <Text variant="caption">{t.browser.features.title}</Text>
        <Column gap="md" style={{ marginTop: spacing.xs }}>
          <Text variant="small">{t.browser.features.encryption}</Text>
          <Text variant="small">{t.browser.features.meshRouting}</Text>
          <Text variant="small">{t.browser.features.zeroCensorship}</Text>
          <Text variant="small">{t.browser.features.zeroKnowledge}</Text>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default BrowserScreen;
