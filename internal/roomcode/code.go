// Package roomcode generates the fixed codes used to access rooms.
package roomcode

import (
	"crypto/rand"
	"math/big"
	"strings"
)

// Alphabet omits characters that are easily confused when typing a room code.
const Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// New generates a uniformly random six-character room code.
func New() (string, error) {
	var code [6]byte
	maximum := big.NewInt(int64(len(Alphabet)))
	for index := range code {
		value, err := rand.Int(rand.Reader, maximum)
		if err != nil {
			return "", err
		}
		code[index] = Alphabet[value.Int64()]
	}
	return string(code[:]), nil
}

// Normalize makes typed and scanned room codes comparable.
func Normalize(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}
