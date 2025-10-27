import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';

const BrowserScreen = () => {
  const [currentUrl, setCurrentUrl] = useState('zhtp://network.sovereign');
  const [urlInput, setUrlInput] = useState('zhtp://network.sovereign');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>(['zhtp://network.sovereign']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [browserContent, setBrowserContent] = useState<{
    title: string;
    description: string;
    content: string;
  } | null>(null);

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

  const handleInitialLoad = () => {
    loadWebsite(currentUrl);
  };

  useEffect(() => {
    handleInitialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWebsite = (url: string) => {
    setLoading(true);
    setTimeout(() => {
      const normalizedUrl = url.toLowerCase().trim();
      if (mockWebsites[normalizedUrl]) {
        setBrowserContent(mockWebsites[normalizedUrl]);
      } else {
        setBrowserContent({
          title: 'Site Not Found',
          description: '404 - Domain Not Resolved',
          content: `The domain "${url}" could not be resolved on the ZHTP network. Try visiting zhtp://network.sovereign`,
        });
      }
      setLoading(false);
    }, 800);
  };

  const handleNavigate = () => {
    if (urlInput.trim()) {
      const newUrl = urlInput.toLowerCase().trim();
      setCurrentUrl(newUrl);
      setUrlInput(newUrl);

      // Add to history
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newUrl);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);

      loadWebsite(newUrl);
    }
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const url = history[newIndex];
      setCurrentUrl(url);
      setUrlInput(url);
      loadWebsite(url);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const url = history[newIndex];
      setCurrentUrl(url);
      setUrlInput(url);
      loadWebsite(url);
    }
  };

  const handleRefresh = () => {
    loadWebsite(currentUrl);
  };

  const suggestedSites = [
    { url: 'zhtp://network.sovereign', title: 'Network Hub', emoji: '🌐' },
    { url: 'dao://governance', title: 'DAO Portal', emoji: '🏛️' },
    { url: 'mesh://nodes.local', title: 'Mesh Network', emoji: '🔗' },
    { url: 'zk://identity.sovereign', title: 'ZK Identity', emoji: '👤' },
    { url: 'web4://chat.sovereign', title: 'Chat', emoji: '💬' },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* Browser Controls */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🌐 Web4 Browser</Text>

        {/* Navigation Bar */}
        <View style={styles.navigationBar}>
          <TouchableOpacity
            style={[styles.navButton, !history.length || historyIndex === 0 ? styles.navButtonDisabled : null]}
            onPress={handleBack}
            disabled={historyIndex === 0}
          >
            <Text style={styles.navButtonText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButton, historyIndex >= history.length - 1 ? styles.navButtonDisabled : null]}
            onPress={handleForward}
            disabled={historyIndex >= history.length - 1}
          >
            <Text style={styles.navButtonText}>Forward →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={handleRefresh}>
            <Text style={styles.navButtonText}>🔄 Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Address Bar */}
        <View style={styles.addressBarContainer}>
          <TextInput
            style={styles.addressBar}
            placeholder="Enter ZHTP domain..."
            placeholderTextColor="#666666"
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={handleNavigate}
          />
          <TouchableOpacity style={styles.goButton} onPress={handleNavigate}>
            <Text style={styles.goButtonText}>Go</Text>
          </TouchableOpacity>
        </View>

        {/* Connection Status */}
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>🟢 Connected to ZHTP Network</Text>
          <Text style={styles.statusText}>Protocol: Web4 • Encrypted: ✓</Text>
        </View>
      </View>

      {/* Browser Content */}
      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator size="large" color="#00d4ff" />
          <Text style={styles.loadingText}>Loading {currentUrl}...</Text>
        </View>
      ) : browserContent ? (
        <View style={styles.card}>
          <View style={styles.contentHeader}>
            <Text style={styles.pageTitle}>{browserContent.title}</Text>
            <Text style={styles.pageDescription}>{browserContent.description}</Text>
          </View>
          <View style={styles.pageContent}>
            <Text style={styles.pageText}>{browserContent.content}</Text>
          </View>
        </View>
      ) : null}

      {/* Suggested Sites */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⭐ Suggested Sites</Text>
        {suggestedSites.map(site => (
          <TouchableOpacity
            key={site.url}
            style={styles.suggestedSite}
            onPress={() => {
              setUrlInput(site.url);
              setCurrentUrl(site.url);
              const newHistory = history.slice(0, historyIndex + 1);
              newHistory.push(site.url);
              setHistory(newHistory);
              setHistoryIndex(newHistory.length - 1);
              loadWebsite(site.url);
            }}
          >
            <Text style={styles.suggestedSiteEmoji}>{site.emoji}</Text>
            <View style={styles.suggestedSiteInfo}>
              <Text style={styles.suggestedSiteTitle}>{site.title}</Text>
              <Text style={styles.suggestedSiteUrl}>{site.url}</Text>
            </View>
            <Text style={styles.suggestedSiteArrow}>→</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Browser Features */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ℹ️ Web4 Browser Features</Text>
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔒</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>End-to-End Encryption</Text>
              <Text style={styles.featureDescription}>All connections are encrypted by default</Text>
            </View>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>⚡</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Mesh Routing</Text>
              <Text style={styles.featureDescription}>Decentralized routing through edge nodes</Text>
            </View>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🌍</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Zero Censorship</Text>
              <Text style={styles.featureDescription}>No intermediaries or single point of failure</Text>
            </View>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🎯</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Zero-Knowledge Proofs</Text>
              <Text style={styles.featureDescription}>Verify without revealing information</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Navigation History */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📜 Navigation History</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>No history yet</Text>
        ) : (
          history.map((url, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.historyItem,
                index === historyIndex && styles.historyItemActive,
              ]}
              onPress={() => {
                setHistoryIndex(index);
                setCurrentUrl(url);
                setUrlInput(url);
                loadWebsite(url);
              }}
            >
              <Text style={styles.historyIcon}>
                {index === historyIndex ? '→' : ' '}
              </Text>
              <Text style={styles.historyUrl}>{url}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1e', padding: 16 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#00d4ff', marginBottom: 12 },
  navigationBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#16213e',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: { color: '#ffffff', fontWeight: '600', fontSize: 12 },
  addressBarContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  addressBar: {
    flex: 1,
    backgroundColor: '#0f0f1e',
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    fontSize: 14,
  },
  goButton: {
    backgroundColor: '#00d4ff',
    paddingHorizontal: 16,
    borderRadius: 6,
    justifyContent: 'center',
  },
  goButtonText: { color: '#000000', fontWeight: '600', fontSize: 14 },
  statusBar: { backgroundColor: '#0f0f1e', paddingVertical: 8, borderRadius: 6 },
  statusText: { color: '#51cf66', fontSize: 12, marginVertical: 2 },
  contentHeader: { marginBottom: 16 },
  pageTitle: { fontSize: 20, fontWeight: 'bold', color: '#00d4ff', marginBottom: 4 },
  pageDescription: { fontSize: 13, color: '#00d4ff', marginBottom: 12 },
  pageContent: { backgroundColor: '#0f0f1e', padding: 12, borderRadius: 6 },
  pageText: { color: '#cccccc', fontSize: 14, lineHeight: 20 },
  loadingText: { color: '#00d4ff', marginTop: 12, textAlign: 'center', fontSize: 14 },
  suggestedSite: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  suggestedSiteEmoji: { fontSize: 18, marginRight: 12 },
  suggestedSiteInfo: { flex: 1 },
  suggestedSiteTitle: { color: '#ffffff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  suggestedSiteUrl: { color: '#888888', fontSize: 12 },
  suggestedSiteArrow: { color: '#00d4ff', fontSize: 16, marginLeft: 8 },
  featureList: { gap: 12 },
  featureItem: {
    flexDirection: 'row',
    backgroundColor: '#0f0f1e',
    padding: 12,
    borderRadius: 6,
    alignItems: 'flex-start',
  },
  featureIcon: { fontSize: 24, marginRight: 12, marginTop: 2 },
  featureContent: { flex: 1 },
  featureTitle: { color: '#ffffff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  featureDescription: { color: '#888888', fontSize: 12 },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  historyItemActive: { backgroundColor: '#16213e', paddingHorizontal: 8, borderRadius: 4 },
  historyIcon: { width: 24, color: '#00d4ff', fontWeight: '600' },
  historyUrl: { flex: 1, color: '#cccccc', fontSize: 13, marginLeft: 8 },
  emptyText: { color: '#888888', textAlign: 'center', paddingVertical: 12 },
});

export default BrowserScreen;
