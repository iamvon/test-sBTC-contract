(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-faucet-disabled (err u101))
(define-constant err-amount-too-large (err u102))

(define-fungible-token test-sbtc)

(define-constant token-name "test-sBTC")
(define-constant token-symbol "tsBTC")
(define-data-var token-uri (optional (string-utf8 256)) (some u"https://ipfs.io/ipfs/bafkreibqnozdui4ntgoh3oo437lvhg7qrsccmbzhgumwwjf2smb3eegyqu"))
(define-constant token-decimals u8)
(define-data-var faucet-enabled bool true)
(define-data-var faucet-max-amount uint u100000000)

(define-private (is-owner (sender principal))
  (is-eq sender contract-owner)
)

(define-public (faucet-mint (amount uint) (recipient principal))
  (begin
    (asserts! (var-get faucet-enabled) err-faucet-disabled)
    (asserts! (<= amount (var-get faucet-max-amount)) err-amount-too-large)
    (ft-mint? test-sbtc amount recipient)
  )
)

(define-public (owner-mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-owner tx-sender) err-owner-only)
    (ft-mint? test-sbtc amount recipient)
  )
)

(define-public (owner-burn (amount uint) (owner principal))
  (begin
    (asserts! (is-owner tx-sender) err-owner-only)
    (ft-burn? test-sbtc amount owner)
  )
)

(define-public (set-faucet-enabled (enabled bool))
  (begin
    (asserts! (is-owner tx-sender) err-owner-only)
    (ok (var-set faucet-enabled enabled))
  )
)

(define-public (set-faucet-max-amount (amount uint))
  (begin
    (asserts! (is-owner tx-sender) err-owner-only)
    (ok (var-set faucet-max-amount amount))
  )
)

(define-public (set-token-uri (new-uri (optional (string-utf8 256))))
  (begin
    (asserts! (is-owner tx-sender) err-owner-only)
    (ok (var-set token-uri new-uri))
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (or (is-eq tx-sender sender) (is-eq contract-caller sender)) err-owner-only)
    (try! (ft-transfer? test-sbtc amount sender recipient))
    (match memo memo-buff (print memo-buff) 0x)
    (ok true)
  )
)

(define-read-only (get-name)
  (ok token-name)
)

(define-read-only (get-symbol)
  (ok token-symbol)
)

(define-read-only (get-decimals)
  (ok token-decimals)
)

(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance test-sbtc who))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply test-sbtc))
)

(define-read-only (is-faucet-enabled)
  (ok (var-get faucet-enabled))
)

(define-read-only (get-faucet-max-amount)
  (ok (var-get faucet-max-amount))
)
