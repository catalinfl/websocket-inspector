package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/url"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx       context.Context
	clientsMu sync.Mutex
	clients   map[string]*wsClient
}

type wsClient struct {
	conn     *websocket.Conn
	endpoint string
	writeMu  sync.Mutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		clients: make(map[string]*wsClient),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) ConnectWebSocket(connectionId string, endpoint string) (string, error) {
	connectionId = strings.TrimSpace(connectionId)
	if connectionId == "" {
		return "", fmt.Errorf("connection id is required")
	}

	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return "", fmt.Errorf("websocket URL is required")
	}

	parsedURL, err := url.Parse(endpoint)
	if err != nil {
		return "", fmt.Errorf("invalid websocket URL: %w", err)
	}

	if parsedURL.Scheme != "ws" && parsedURL.Scheme != "wss" {
		return "", fmt.Errorf("unsupported websocket scheme %q", parsedURL.Scheme)
	}

	conn, _, err := websocket.DefaultDialer.Dial(endpoint, nil)
	if err != nil {
		return "", err
	}

	client := &wsClient{
		conn:     conn,
		endpoint: endpoint,
	}

	a.clientsMu.Lock()
	previous := a.clients[connectionId]
	a.clients[connectionId] = client
	a.clientsMu.Unlock()

	if previous != nil {
		_ = previous.conn.Close()
	}

	go a.watchWebSocket(connectionId, client)
	wailsruntime.EventsEmit(a.ctx, "websocket:connected", map[string]string{
		"id":       connectionId,
		"endpoint": endpoint,
	})

	return fmt.Sprintf("Connected to %s", endpoint), nil
}

func (a *App) DisconnectWebSocket(connectionId string) error {
	a.clientsMu.Lock()
	client := a.clients[connectionId]
	if client != nil {
		delete(a.clients, connectionId)
	}
	a.clientsMu.Unlock()

	if client == nil || client.conn == nil {
		return nil
	}

	err := client.conn.Close()
	wailsruntime.EventsEmit(a.ctx, "websocket:disconnected", map[string]string{
		"id":       connectionId,
		"endpoint": client.endpoint,
	})
	return err
}

func (a *App) SendWebSocketMessage(connectionId string, message string) error {
	a.clientsMu.Lock()
	client := a.clients[connectionId]
	a.clientsMu.Unlock()

	if client == nil || client.conn == nil {
		return fmt.Errorf("websocket is not connected")
	}

	client.writeMu.Lock()
	defer client.writeMu.Unlock()

	return client.conn.WriteMessage(websocket.TextMessage, []byte(message))
}

func (a *App) SendWebSocketBinary(connectionId string, payloadBase64 string) error {
	a.clientsMu.Lock()
	client := a.clients[connectionId]
	a.clientsMu.Unlock()

	if client == nil || client.conn == nil {
		return fmt.Errorf("websocket is not connected")
	}

	payload, err := base64.StdEncoding.DecodeString(payloadBase64)
	if err != nil {
		return fmt.Errorf("invalid base64 payload: %w", err)
	}

	client.writeMu.Lock()
	defer client.writeMu.Unlock()

	return client.conn.WriteMessage(websocket.BinaryMessage, payload)
}

func (a *App) watchWebSocket(connectionId string, client *wsClient) {
	conn := client.conn
	endpoint := client.endpoint

	defer conn.Close()

	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if a.clearWebSocket(connectionId, conn) {
				wailsruntime.EventsEmit(a.ctx, "websocket:disconnected", map[string]string{
					"id":       connectionId,
					"endpoint": endpoint,
				})
			}
			return
		}

		if messageType == websocket.TextMessage {
			payload := string(message)
			wailsruntime.EventsEmit(a.ctx, "websocket:message", map[string]string{
				"id":   connectionId,
				"type": "text",
				"data": payload,
			})
		}

		if messageType == websocket.BinaryMessage {
			encoded := base64.StdEncoding.EncodeToString(message)
			wailsruntime.EventsEmit(a.ctx, "websocket:message", map[string]string{
				"id":   connectionId,
				"type": "binary",
				"data": encoded,
			})
		}
	}
}

func (a *App) clearWebSocket(connectionId string, conn *websocket.Conn) bool {
	a.clientsMu.Lock()
	defer a.clientsMu.Unlock()

	client, ok := a.clients[connectionId]
	if !ok || client.conn != conn {
		return false
	}

	delete(a.clients, connectionId)
	return true
}
