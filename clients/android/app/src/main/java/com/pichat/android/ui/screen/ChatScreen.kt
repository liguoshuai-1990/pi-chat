package com.pichat.android.ui.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.MessageRole
import com.pichat.android.data.network.ConnectionState
import com.pichat.android.ui.theme.*
import com.pichat.android.ui.viewmodel.ChatViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(viewModel: ChatViewModel) {
    val messages by viewModel.messages.collectAsState()
    val sessions by viewModel.sessions.collectAsState()
    val isStreaming by viewModel.isStreaming.collectAsState()
    val connState by viewModel.connectionState.collectAsState()
    val sessionTitle by viewModel.currentSessionTitle.collectAsState()

    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    var inputText by remember { mutableStateOf("") }

    LaunchedEffect(messages.size, messages.lastOrNull()?.content?.length) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = SurfaceDark,
                modifier = Modifier.width(300.dp)
            ) {
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Pi Chat History",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = TextPrimary
                    )
                    IconButton(onClick = {
                        viewModel.newSession()
                        coroutineScope.launch { drawerState.close() }
                    }) {
                        Icon(Icons.Default.Add, contentDescription = "New Session", tint = PrimaryPurpleLight)
                    }
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp), color = SurfaceVariantDark)
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(sessions) { session ->
                        NavigationDrawerItem(
                            label = {
                                Text(
                                    session.sessionName ?: session.firstUser ?: session.name,
                                    maxLines = 1,
                                    color = TextPrimary
                                )
                            },
                            selected = false,
                            onClick = {
                                viewModel.switchSession(session)
                                coroutineScope.launch { drawerState.close() }
                            },
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                            colors = NavigationDrawerItemDefaults.colors(
                                unselectedContainerColor = Color.Transparent
                            )
                        )
                    }
                }
            }
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(sessionTitle, maxLines = 1, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(
                                            when (connState) {
                                                ConnectionState.CONNECTED -> AccentGreen
                                                ConnectionState.CONNECTING -> Color.Yellow
                                                else -> Color.Red
                                            }
                                        )
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    when (connState) {
                                        ConnectionState.CONNECTED -> "Pi Connected"
                                        ConnectionState.CONNECTING -> "Connecting…"
                                        else -> "Disconnected"
                                    },
                                    fontSize = 11.sp,
                                    color = TextSecondary
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { coroutineScope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "Open History")
                        }
                    },
                    actions = {
                        IconButton(onClick = { viewModel.newSession() }) {
                            Icon(Icons.Default.Add, contentDescription = "New Chat")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = SurfaceDark,
                        titleContentColor = TextPrimary,
                        navigationIconContentColor = TextPrimary,
                        actionIconContentColor = TextPrimary
                    )
                )
            },
            bottomBar = {
                Surface(
                    color = SurfaceDark,
                    tonalElevation = 4.dp,
                    modifier = Modifier.fillMaxWidth().imePadding()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = inputText,
                            onValueChange = { inputText = it },
                            placeholder = { Text("Ask Pi or steer task…", color = TextSecondary) },
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(24.dp)),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = SurfaceVariantDark,
                                unfocusedContainerColor = SurfaceVariantDark,
                                focusedBorderColor = PrimaryPurple,
                                unfocusedBorderColor = Color.Transparent,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary
                            ),
                            maxLines = 4
                        )
                        Spacer(Modifier.width(8.dp))
                        if (isStreaming) {
                            IconButton(
                                onClick = { viewModel.abort() },
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFFDC2626))
                            ) {
                                Icon(Icons.Default.Stop, contentDescription = "Abort", tint = Color.White)
                            }
                        } else {
                            IconButton(
                                onClick = {
                                    if (inputText.isNotBlank()) {
                                        viewModel.sendMessage(inputText)
                                        inputText = ""
                                    }
                                },
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(CircleShape)
                                    .background(PrimaryPurple)
                            ) {
                                Icon(Icons.Default.Send, contentDescription = "Send", tint = Color.White)
                            }
                        }
                    }
                }
            },
            containerColor = BgDark
        ) { paddingValues ->
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(vertical = 12.dp)
            ) {
                items(messages, key = { it.id }) { message ->
                    MessageBubble(message)
                }
            }
        }
    }
}

@Composable
fun MessageBubble(message: ChatMessage) {
    val isUser = message.role == MessageRole.USER
    var showThinking by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 320.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isUser) 16.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 16.dp
                    )
                )
                .background(if (isUser) UserBubble else SurfaceDark)
                .padding(12.dp)
        ) {
            if (message.thinkingContent.isNotEmpty()) {
                Surface(
                    color = ThinkingBg,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    onClick = { showThinking = !showThinking }
                ) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                if (showThinking) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                                contentDescription = null,
                                tint = PrimaryPurpleLight,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                if (message.isThinking) "Thinking in progress…" else "Thinking Process",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                color = PrimaryPurpleLight
                            )
                        }
                        AnimatedVisibility(visible = showThinking) {
                            Text(
                                message.thinkingContent,
                                fontSize = 12.sp,
                                color = TextSecondary,
                                modifier = Modifier.padding(top = 6.dp)
                            )
                        }
                    }
                }
            }

            if (message.content.isNotEmpty()) {
                Text(
                    text = message.content,
                    color = TextPrimary,
                    fontSize = 15.sp,
                    lineHeight = 22.sp
                )
            }
        }
    }
}
