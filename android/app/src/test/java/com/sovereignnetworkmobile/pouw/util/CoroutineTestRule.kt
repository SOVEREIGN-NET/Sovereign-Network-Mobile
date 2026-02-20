package com.sovereignnetworkmobile.pouw.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.rules.TestWatcher
import org.junit.runner.Description

/**
 * JUnit rule for testing coroutines.
 * Provides a test dispatcher and handles setup/teardown of the Main dispatcher.
 *
 * Usage:
 * ```
 * @get:Rule
 * val coroutineRule = CoroutineTestRule()
 *
 * @Test
 * fun test() = runTest {
 *     // Test code using coroutineRule.testDispatcher
 * }
 * ```
 */
@ExperimentalCoroutinesApi
class CoroutineTestRule(
    val testDispatcher: TestDispatcher = StandardTestDispatcher()
) : TestWatcher() {

    override fun starting(description: Description) {
        super.starting(description)
        Dispatchers.setMain(testDispatcher)
    }

    override fun finished(description: Description) {
        super.finished(description)
        Dispatchers.resetMain()
    }
}
