# PoUW Operational Runbook

## Monitoring Dashboards

### Metrics to Watch
- Receipts generated per minute
- Submission success rate
- Average verification time
- Queue depth
- Battery impact
- Network errors

### Alert Thresholds
- Queue depth > 1000
- Submission success < 95%
- Verification time > 5s
- Battery drain > 10%/hour

## Common Issues

### Issue: Receipts Not Submitting
**Symptoms**: Queue depth increasing
**Diagnosis**:
1. Check network connectivity
2. Check node endpoint health
3. Check rate limiting
**Resolution**:
- Clear queue if needed
- Restart submission loop
- Escalate to backend if node issue

### Issue: High Rejection Rate
**Symptoms**: Many receipts rejected by node
**Diagnosis**:
1. Check rejection reasons
2. Verify protobuf serialization
3. Check clock sync
**Resolution**:
- Fix serialization issue
- Sync device clock
- Update client if needed

### Issue: Battery Drain
**Symptoms**: High battery usage
**Diagnosis**:
1. Profile CPU usage
2. Check verification frequency
3. Check network activity
**Resolution**:
- Reduce verification rate
- Implement thermal throttling
- Batch receipts more aggressively

## Debugging

### Enable Debug Logging
iOS: Set `PoUWLogLevel = .debug`
Android: Set `PoUWConfig.debug = true`

### Export Receipt Queue
iOS: Core Data export
Android: Room database export

### Verify Receipt Format
Use test vectors to verify serialization

## Escalation
- P1: Reward system down → Page on-call
- P2: High rejection rate → Slack #pouw-alerts
- P3: Performance issues → Jira ticket
